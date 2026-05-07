const WIKI_BASE = "https://arena-breakout-infinite.fandom.com";
const USER_AGENT = "mrnutt3r-abi-bot/1.0 (+live wiki fallback)";

function stripHtml(html = "") {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanWikiText(text = "") {
  return String(text)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: {
      "accept": "application/json, text/plain, */*",
      "user-agent": USER_AGENT
    }
  });
  if (!res.ok) throw new Error(`Wiki request failed: ${res.status}`);
  return await res.json();
}

function buildSearchUrl(query) {
  const q = encodeURIComponent(query);
  return `${WIKI_BASE}/api.php?action=query&list=search&srsearch=${q}&utf8=1&format=json&origin=*`;
}

function buildExtractUrl(title) {
  const t = encodeURIComponent(title);
  return `${WIKI_BASE}/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${t}&format=json&origin=*`;
}

function buildCategoriesUrl(title) {
  const t = encodeURIComponent(title);
  return `${WIKI_BASE}/api.php?action=query&prop=categories&cllimit=10&redirects=1&titles=${t}&format=json&origin=*`;
}

function pickBestSearchResult(results = [], query = "") {
  if (!results.length) return null;
  const q = query.toLowerCase();

  const scored = results.map(r => {
    const title = String(r.title || "").toLowerCase();
    const snippet = stripHtml(r.snippet || "").toLowerCase();

    let score = 0;
    if (title === q) score += 100;
    if (title.includes(q)) score += 40;
    if (q.includes(title) && title.length > 2) score += 20;
    if (snippet.includes(q)) score += 10;
    score -= Number(r.wordcount || 0) > 5000 ? 5 : 0;

    return { ...r, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  return scored[0];
}

export async function searchWiki(question) {
  const query = String(question || "").trim();
  if (!query) {
    return {
      source: "wiki",
      summary: "I need an actual question before I can go fishing through the wiki."
    };
  }

  try {
    const searchData = await getJson(buildSearchUrl(query));
    const results = searchData?.query?.search || [];
    const best = pickBestSearchResult(results, query);

    if (!best) {
      return {
        source: "wiki",
        summary: `I couldn't find a solid ABI wiki hit for "${query}".`
      };
    }

    const title = best.title;
    const [extractData, categoryData] = await Promise.allSettled([
      getJson(buildExtractUrl(title)),
      getJson(buildCategoriesUrl(title))
    ]);

    let extract = "";
    if (extractData.status === "fulfilled") {
      const pages = extractData.value?.query?.pages || {};
      const page = Object.values(pages)[0];
      extract = cleanWikiText(page?.extract || "");
    }

    let categories = [];
    if (categoryData.status === "fulfilled") {
      const pages = categoryData.value?.query?.pages || {};
      const page = Object.values(pages)[0];
      categories = (page?.categories || [])
        .map(c => String(c.title || "").replace(/^Category:/, "").trim())
        .filter(Boolean);
    }

    const summaryBase =
      extract ||
      cleanWikiText(stripHtml(best.snippet || "")) ||
      `Found a wiki page for ${title}.`;

    const categorySuffix = categories.length
      ? ` Categories: ${categories.slice(0, 4).join(", ")}.`
      : "";

    return {
      source: "wiki",
      title,
      url: `${WIKI_BASE}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      summary: `${title}: ${summaryBase}${categorySuffix}`.trim()
    };
  } catch (err) {
    return {
      source: "wiki",
      summary: `Wiki lookup failed for "${query}" — ${err.message}`
    };
  }
}
