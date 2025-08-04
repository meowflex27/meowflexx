import axios from 'axios';

const TMDB_API_KEY = 'ea97a714a43a0e3481592c37d2c7178a';

function extractSubjectId(html, tvTitle) {
  const regex = new RegExp(`"(\\d{16,})",\\s*"[^"]*",\\s*"${tvTitle.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}"`, 'i');
  const match = html.match(regex);
  return match ? match[1] : null;
}

function extractDetailPathFromHtml(html, subjectId, tvTitle) {
  const slug = tvTitle
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') + '-';

  const idPattern = new RegExp(`"(${subjectId})"`);
  const idMatch = idPattern.exec(html);
  if (!idMatch) return null;

  const before = html.substring(0, idMatch.index);
  const detailPathRegex = new RegExp(`"((?:${slug})[^"]+)"`, 'gi');
  let match, lastMatch = null;
  while ((match = detailPathRegex.exec(before)) !== null) {
    lastMatch = match[1];
  }
  return lastMatch || null;
}

export default async function handler(req, res) {
  const { tmdbId, season, episode } = req.query;
  if (!tmdbId || !season || !episode) return res.status(400).json({ error: 'Missing parameters' });

  try {
    const tmdbResp = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
    const title = tmdbResp.data.name;
    const year = tmdbResp.data.first_air_date?.split('-')[0];

    const searchKeyword = `${title} ${year}`;
    const searchUrl = `https://moviebox.ph/web/searchResult?keyword=${encodeURIComponent(searchKeyword)}`;
    const searchResp = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const html = searchResp.data;
    const subjectId = extractSubjectId(html, title);
    if (!subjectId) return res.status(404).json({ error: 'Subject ID not found' });

    const detailPath = extractDetailPathFromHtml(html, subjectId, title);
    const detailsUrl = detailPath ? `https://moviebox.ph/movies/${detailPath}?id=${subjectId}` : null;

    const downloadUrl = `https://moviebox.ph/wefeed-h5-bff/web/subject/download?subjectId=${subjectId}&se=${season}&ep=${episode}`;

    const downloadResp = await axios.get(downloadUrl, {
      headers: {
        'referer': detailsUrl,
        'user-agent': 'Mozilla/5.0',
        'x-source': 'h5',
        'x-client-info': JSON.stringify({ timezone: 'Africa/Lagos' }),
        'cookie': [
          'i18n_lang=en'
        ].join('; ')
      }
    });

    return res.json({
      title,
      year,
      subjectId,
      detailPath: detailPath || 'Not found',
      detailsUrl: detailsUrl || 'Not available',
      downloadProxy: `https://movie-proxy-gules.vercel.app/api/proxy?video=${encodeURIComponent(downloadResp.data?.data?.[0]?.url || '')}`,
      downloadData: downloadResp.data
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
