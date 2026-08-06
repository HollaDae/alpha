const endpoints = {
  trending: "/trending/all/day",
  new: "/movie/now_playing",
  upcoming: "/movie/upcoming",
  tv: "/tv/popular",
  top: "/movie/top_rated"
};

export default async function handler(request, response) {
  const category = request.query.category || "trending";
  const endpoint = endpoints[category];

  if (!endpoint) {
    return response.status(400).json({
      error: "Invalid category."
    });
  }

  const token = process.env.TMDB_ACCESS_TOKEN;

  if (!token) {
    return response.status(500).json({
      error: "TMDB access token is missing."
    });
  }

  try {
    const tmdbResponse = await fetch(
      `https://api.themoviedb.org/3${endpoint}?language=en-US&page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      }
    );

    const data = await tmdbResponse.json();

    if (!tmdbResponse.ok) {
      return response.status(tmdbResponse.status).json({
        error: data.status_message || "TMDB request failed."
      });
    }

    return response.status(200).json({
      results: Array.isArray(data.results)
        ? data.results.slice(0, 20)
        : []
    });
  } catch (error) {
    console.error(error);

    return response.status(500).json({
      error: "Unable to connect to TMDB."
    });
  }
}
