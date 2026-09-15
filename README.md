# EvaDiamond BioIntel

Premium public-biography research chatbot for Netlify.

## Deploy
Upload/import this folder into Netlify. Set the Functions directory to `netlify/functions` and publish directory to `.`.

## AI environment variables
In Netlify Project configuration → Environment variables, add:
- `AI_API_KEY` — your secret AI provider key
- `AI_API_URL` — optional compatible chat-completions endpoint
- `AI_MODEL` — optional supported model name

Never put the AI key in `index.html`.

## Starter sources
The function uses Wikipedia and Wikidata without an API key. For a production-grade product, add licensed/reputable news, official, academic and institutional search APIs, source scoring, identity disambiguation and claim-level citations.

## Privacy
Use public-source research only. Do not build the service to expose private addresses, financial information, passwords, private medical data, precise private locations, or other sensitive information. Missing spouse data is not evidence of being unmarried.
