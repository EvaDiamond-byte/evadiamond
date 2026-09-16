export default async (req) => {
  // Handle browser preflight request
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (req.method !== "POST") {
    return json(
      { error: "Method not allowed. Please use POST." },
      405
    );
  }

  try {
    const body = await req.json();

    const name = String(body.name || "").trim();
    const researchType = String(
      body.researchType || "General biography"
    ).trim();
    const question = String(body.question || "").trim();

    if (!name) {
      return json(
        { error: "Please enter the person's name." },
        400
      );
    }

    // Read the secret keys from Netlify Environment Variables
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

    if (!GEMINI_API_KEY) {
      return json(
        { error: "GEMINI_API_KEY is missing from Netlify." },
        500
      );
    }

    if (!TAVILY_API_KEY) {
      return json(
        { error: "TAVILY_API_KEY is missing from Netlify." },
        500
      );
    }

    // =========================================================
    // STEP 1: SEARCH THE PUBLIC WEB WITH TAVILY
    // =========================================================

    const searchQuery = `
      ${name}
      ${researchType}
      ${question}
    `.trim();

    const tavilyResponse = await fetch(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query: searchQuery,
          search_depth: "advanced",
          topic: "general",
          max_results: 8,
          include_answer: true,
          include_raw_content: false,
        }),
      }
    );

    if (!tavilyResponse.ok) {
      const errorText = await tavilyResponse.text();

      console.error("Tavily error:", errorText);

      return json(
        {
          error: "Tavily web search failed.",
          details: errorText,
        },
        502
      );
    }

    const tavilyData = await tavilyResponse.json();

    const results = Array.isArray(tavilyData.results)
      ? tavilyData.results
      : [];

    // Prepare the search results for Gemini
    const sources = results.map((item, index) => ({
      number: index + 1,
      title: item.title || "Untitled source",
      url: item.url || "",
      content: item.content || "",
    }));

    const evidence = sources
      .map(
        (source) => `
SOURCE ${source.number}

Title:
${source.title}

URL:
${source.url}

Information:
${source.content}
`
      )
      .join("\n-------------------------\n");

    // =========================================================
    // STEP 2: ASK GEMINI TO ANALYZE THE SOURCES
    // =========================================================

    const prompt = `
You are EvaDiamond BioIntel, a professional public-biography
research and intelligence assistant.

SUBJECT:
${name}

RESEARCH AREA:
${researchType}

USER QUESTION:
${question || "Provide a comprehensive biography."}

Your task is to analyze the supplied public sources and produce
an accurate, evidence-aware research report.

IMPORTANT RULES:

1. Use only information supported by the supplied sources.
2. Never invent facts.
3. Do not present guesses as facts.
4. If sources disagree, clearly mention the disagreement.
5. If information cannot be adequately verified, say so.
6. Do not expose private or sensitive personal information.
7. Do not provide private addresses, phone numbers, passwords,
   financial information, private medical information or other
   sensitive personal data.

MARITAL STATUS:

Be particularly careful with marriage and family information.

Do NOT say that a person is unmarried simply because you could
not find information about a spouse.

Distinguish between:

- Currently married
- Previously married
- Spouse publicly documented
- Marriage publicly reported but not sufficiently verified
- Marital status not publicly confirmed

Create the report using these sections:

PROFILE
EARLY LIFE AND BACKGROUND
EDUCATION
CAREER
MAJOR ACHIEVEMENTS
TIMELINE
MARRIAGE / FAMILY INFORMATION
KEY FINDINGS
SOURCE NOTES

Return ONLY valid JSON using exactly this structure:

{
  "profile": "",
  "earlyLife": "",
  "education": "",
  "career": "",
  "achievements": [],
  "timeline": [
    {
      "year": "",
      "event": ""
    }
  ],
  "maritalStatus": "",
  "familyInformation": "",
  "keyFindings": [],
  "sourceNotes": ""
}

PUBLIC SOURCES:

${evidence}
`;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(GEMINI_API_KEY),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();

      console.error("Gemini error:", errorText);

      return json(
        {
          error: "Gemini AI request failed.",
          details: errorText,
        },
        502
      );
    }

    const geminiData = await geminiResponse.json();

    const generatedText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      return json(
        {
          error: "Gemini returned an empty response.",
        },
        502
      );
    }

    // =========================================================
    // STEP 3: CONVERT GEMINI RESPONSE INTO JSON
    // =========================================================

    let report;

    try {
      report = JSON.parse(generatedText);
    } catch (parseError) {
      console.error("JSON parsing error:", parseError);

      report = {
        profile: generatedText,
        earlyLife: "",
        education: "",
        career: "",
        achievements: [],
        timeline: [],
        maritalStatus:
          "Marital status could not be separately verified from the available sources.",
        familyInformation: "",
        keyFindings: [],
        sourceNotes: "",
      };
    }

    // =========================================================
    // STEP 4: SEND REPORT BACK TO EVA DIAMOND
    // =========================================================

    return json({
      success: true,
      subject: name,
      researchType,
      report,

      sources: sources.map((source) => ({
        number: source.number,
        title: source.title,
        url: source.url,
      })),

      searchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("EvaDiamond BioIntel error:", error);

    return json(
      {
        error: "EvaDiamond BioIntel could not complete the research.",
        details: error?.message || "Unknown error",
      },
      500
    );
  }
};


// =============================================================
// HELPER: JSON RESPONSE
// =============================================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
    },
  });
}


// =============================================================
// HELPER: CORS
// =============================================================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
