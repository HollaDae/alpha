const endpoints = {
  trending: "/trending/all/day",
  new: "/movie/now_playing",
  upcoming: "/movie/upcoming",
  tv: "/tv/popular",
  top: "/movie/top_rated"
};

function getMediaType(item) {
  if (item.media_type === "movie" || item.media_type === "tv") {
    return item.media_type;
  }

  return item.title ? "movie" : "tv";
}

export default async function handler(request, response) {
  const token = process.env.TMDB_ACCESS_TOKEN;

  if (!token) {
    return response.status(500).json({
      error: "TMDB access token is missing."
    });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json"
  };

  try {
    /*
      DETAIL REQUEST
      Example:
      /api/tmdb?id=123&type=movie
    */
    if (request.query.id) {
      const id = String(request.query.id);
      const type = request.query.type === "tv" ? "tv" : "movie";

      const detailURL =
        `https://api.themoviedb.org/3/${type}/${id}` +
        `?language=en-US&append_to_response=credits,videos,watch/providers`;

      const tmdbResponse = await fetch(detailURL, { headers });
      const data = await tmdbResponse.json();

      if (!tmdbResponse.ok) {
        return response.status(tmdbResponse.status).json({
          error: data.status_message || "Unable to load title details."
        });
      }

      const videos = Array.isArray(data.videos?.results)
        ? data.videos.results
        : [];

      const trailer =
        videos.find(
          (video) =>
            video.site === "YouTube" &&
            video.type === "Trailer" &&
            video.official
        ) ||
        videos.find(
          (video) =>
            video.site === "YouTube" &&
            video.type === "Trailer"
        ) ||
        videos.find((video) => video.site === "YouTube") ||
        null;

      const cast = Array.isArray(data.credits?.cast)
        ? data.credits.cast.slice(0, 10).map((person) => ({
            id: person.id,
            name: person.name,
            character: person.character,
            profile_path: person.profile_path
          }))
        : [];

      const usProviders = data["watch/providers"]?.results?.US || {};

      return response.status(200).json({
        id: data.id,
        type,
        title: data.title || data.name || "Untitled",
        overview: data.overview || "No synopsis is available.",
        poster_path: data.poster_path,
        backdrop_path: data.backdrop_path,
        release_date: data.release_date || data.first_air_date || "",
        runtime:
          type === "movie"
            ? data.runtime
            : data.episode_run_time?.[0] || null,
        vote_average: data.vote_average || 0,
        genres: Array.isArray(data.genres)
          ? data.genres.map((genre) => genre.name)
          : [],
        trailer_key: trailer?.key || null,
        cast,
        providers: {
          link: usProviders.link || null,
          streaming: usProviders.flatrate || [],
          free: usProviders.free || [],
          ads: usProviders.ads || [],
          rent: usProviders.rent || [],
          buy: usProviders.buy || []
        }
      });
    }

    /*
      CATEGORY REQUEST
      Example:
      /api/tmdb?category=trending
    */
    const category = request.query.category || "trending";
    const endpoint = endpoints[category];

    if (!endpoint) {
      return response.status(400).json({
        error: "Invalid category."
      });
    }

    const tmdbResponse = await fetch(
      `https://api.themoviedb.org/3${endpoint}?language=en-US&page=1`,
      { headers }
    );

    const data = await tmdbResponse.json();

    if (!tmdbResponse.ok) {
      return response.status(tmdbResponse.status).json({
        error: data.status_message || "TMDB request failed."
      });
    }

    const results = Array.isArray(data.results)
      ? data.results.slice(0, 20).map((item) => ({
          ...item,
          media_type: getMediaType(item)
        }))
      : [];

    return response.status(200).json({ results });
  } catch (error) {
    console.error(error);

    return response.status(500).json({
      error: "Unable to connect to TMDB."
    });
  }
}
