export default async (req) => {
  // Allow browser preflight requests
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return json(
      {
        error: "Method not allowed. Please use POST.",
      },
      405
    );
  }

  try {
    // Read the request sent by the EvaDiamond website
    const body = await req.json();

    const name = String(body.name || "").trim();

    const researchType = String(
      body.researchType || "General biography"
    ).trim();

    const question = String(
      body.question || ""
    ).trim();

    // Make sure a person's name was entered
    if (!name) {
      return json(
        {
          error: "Please enter the person's name.",
        },
        400
      );
    }

    // =========================================================
    // GET API KEYS FROM NETLIFY ENVIRONMENT VARIABLES
    // =========================================================

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

    if (!GEMINI_API_KEY) {
      return json(
        {
          error: "GEMINI_API_KEY is missing from Netlify.",
        },
        500
      );
    }

    if (!TAVILY_API_KEY) {
      return json(
        {
          error: "TAVILY_API_KEY is missing from Netlify.",
        },
        500
      );
    }

    // =========================================================
    // TAVILY WEB SEARCH
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

    // Check Tavily response
    if (!tavilyResponse.ok) {
      const tavilyError = await tavilyResponse.text();

      console.error(
        "Tavily error:",
        tavilyError
      );

      return json(
        {
          error: "Tavily web search failed.",

          details: tavilyError,
        },
        502
      );
    }

    const tavilyData =
      await tavilyResponse.json();

    // Get search results
    const results = Array.isArray(
      tavilyData.results
    )
      ? tavilyData.results
      : [];

    // =========================================================
    // PREPARE SOURCES FOR GEMINI
    // =========================================================

    const sources = results.map(
      (item, index) => ({
        number: index + 1,

        title:
          item.title ||
          "Untitled source",

        url:
          item.url ||
          "",

        content:
          item.content ||
          "",
      })
    );

    // Turn search results into evidence
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
      .join(
        "\n-------------------------\n"
      );

    // =========================================================
    // GEMINI AI ANALYSIS
    // =========================================================

    const prompt = `
You are EvaDiamond BioIntel.

You are a professional public-biography
research assistant.

You research publicly available information
and produce evidence-aware reports.

SUBJECT:
${name}

RESEARCH AREA:
${researchType}

USER QUESTION:
${
  question ||
  "Provide a comprehensive public biography."
}

IMPORTANT RESEARCH RULES:

1. Use only information supported by the
   supplied public sources.

2. Never invent facts.

3. Do not present guesses as facts.

4. If sources disagree, clearly explain
   the disagreement.

5. If information cannot be adequately
   verified, say that it could not be
   sufficiently verified.

6. Do not provide private or sensitive
   personal information.

7. Do not provide private addresses,
   personal phone numbers, passwords,
   financial information, private medical
   information, or other sensitive data.

MARITAL STATUS RULES:

Be especially careful with marriage and
family information.

Never say that someone is unmarried simply
because a spouse could not be found.

Distinguish between:

- Currently married
- Previously married
- Spouse publicly documented
- Marriage publicly reported but not
  sufficiently verified
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

Return ONLY valid JSON.

Use exactly this structure:

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

    // =========================================================
    // SEND REQUEST TO GOOGLE GEMINI
    // =========================================================

    const geminiURL =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      encodeURIComponent(
        GEMINI_API_KEY
      );

    const geminiResponse =
      await fetch(
        geminiURL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
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

              responseMimeType:
                "application/json",
            },
          }),
        }
      );

    // Check Gemini response
    if (!geminiResponse.ok) {
      const geminiError =
        await geminiResponse.text();

      console.error(
        "Gemini error:",
        geminiError
      );

      return json(
        {
          error:
            "Gemini AI request failed.",

          details:
            geminiError,
        },
        502
      );
    }

    const geminiData =
      await geminiResponse.json();

    // Extract Gemini answer
    const generatedText =
      geminiData
        ?.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text;

    if (!generatedText) {
      return json(
        {
          error:
            "Gemini returned an empty response.",
        },
        502
      );
    }

    // =========================================================
    // CONVERT GEMINI ANSWER INTO JSON
    // =========================================================

    let report;

    try {
      report =
        JSON.parse(
          generatedText
        );
    } catch (parseError) {
      console.error(
        "JSON parsing error:",
        parseError
      );

      report = {
        profile:
          generatedText,

        earlyLife: "",

        education: "",

        career: "",

        achievements: [],

        timeline: [],

        maritalStatus:
          "Marital status could not be separately verified from the available public sources.",

        familyInformation: "",

        keyFindings: [],

        sourceNotes: "",
      };
    }

    // =========================================================
    // SEND FINAL RESULT BACK TO WEBSITE
    // =========================================================

    return json({
      success: true,

      subject: name,

      researchType:
        researchType,

      report: report,

      sources:
        sources.map(
          (source) => ({
            number:
              source.number,

            title:
              source.title,

            url:
              source.url,
          })
        ),

      searchedAt:
        new Date().toISOString(),
    });

  } catch (error) {

    console.error(
      "EvaDiamond BioIntel error:",
      error
    );

    return json(
      {
        error:
          "EvaDiamond BioIntel could not complete the research.",

        details:
          error?.message ||
          "Unknown error",
      },
      500
    );
  }
};


// =============================================================
// JSON RESPONSE HELPER
// =============================================================

function json(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status: status,

      headers: {
        ...corsHeaders(),

        "Content-Type":
          "application/json",
      },
    }
  );
}


// =============================================================
// CORS HEADERS
// =============================================================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Access-Control-Allow-Methods":
      "POST, OPTIONS",
  };
}
