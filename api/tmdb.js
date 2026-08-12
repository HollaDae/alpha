const listEndpoints = {
  new: "/movie/now_playing",
  upcoming: "/movie/upcoming",
  tv: "/tv/popular",
  top: "/movie/top_rated"
};

const allowedSorts = {
  popular: "popularity.desc",
  rating: "vote_average.desc",
  newest: "primary_release_date.desc",
  oldest: "primary_release_date.asc"
};

function getMediaType(item) {
  if (item.media_type === "movie" || item.media_type === "tv") {
    return item.media_type;
  }

  return item.title ? "movie" : "tv";
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function getDateRange(dateFilter) {
  const today = new Date();
  const startOfToday = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate()
    )
  );

  if (dateFilter === "week") {
    return {
      start: formatDate(startOfToday),
      end: formatDate(addDays(startOfToday, 7))
    };
  }

  if (dateFilter === "month") {
    return {
      start: formatDate(startOfToday),
      end: formatDate(addMonths(startOfToday, 1))
    };
  }

  if (dateFilter === "year") {
    return {
      start: `${startOfToday.getUTCFullYear()}-01-01`,
      end: `${startOfToday.getUTCFullYear()}-12-31`
    };
  }

  return null;
}

function normalizeResults(items, forcedType = null) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => ({
    ...item,
    media_type: forcedType || getMediaType(item)
  }));
}

function sortCombinedResults(items, sort) {
  const sorted = [...items];

  if (sort === "rating") {
    return sorted.sort(
      (a, b) =>
        Number(b.vote_average || 0) - Number(a.vote_average || 0)
    );
  }

  if (sort === "newest" || sort === "oldest") {
    const direction = sort === "newest" ? -1 : 1;

    return sorted.sort((a, b) => {
      const firstDate =
        a.release_date ||
        a.first_air_date ||
        "1900-01-01";

      const secondDate =
        b.release_date ||
        b.first_air_date ||
        "1900-01-01";

      return firstDate.localeCompare(secondDate) * direction;
    });
  }

  return sorted.sort(
    (a, b) => Number(b.popularity || 0) - Number(a.popularity || 0)
  );
}

function buildDiscoverURL({
  type,
  provider,
  sort,
  date,
  category
}) {
  const mediaType = type === "tv" ? "tv" : "movie";
  const params = new URLSearchParams({
    language: "en-US",
    page: "1",
    include_adult: "false",
    watch_region: "US"
  });

  if (provider) {
    params.set("with_watch_providers", provider);
    params.set("with_watch_monetization_types", "flatrate|free|ads");
  }

  if (mediaType === "movie") {
    params.set(
      "sort_by",
      allowedSorts[sort] || "popularity.desc"
    );

    if (sort === "rating") {
      params.set("vote_count.gte", "50");
    }
  } else {
    const tvSorts = {
      popular: "popularity.desc",
      rating: "vote_average.desc",
      newest: "first_air_date.desc",
      oldest: "first_air_date.asc"
    };

    params.set("sort_by", tvSorts[sort] || "popularity.desc");

    if (sort === "rating") {
      params.set("vote_count.gte", "25");
    }
  }

  const selectedDateRange = getDateRange(date);

  if (selectedDateRange) {
    if (mediaType === "movie") {
      params.set(
        "primary_release_date.gte",
        selectedDateRange.start
      );

      params.set(
        "primary_release_date.lte",
        selectedDateRange.end
      );
    } else {
      params.set(
        "first_air_date.gte",
        selectedDateRange.start
      );

      params.set(
        "first_air_date.lte",
        selectedDateRange.end
      );
    }
  }

  if (category === "theaters") {
    const today = new Date();
    const start = formatDate(today);
    const end = formatDate(addMonths(today, 6));

    params.set("region", "US");
    params.set("with_release_type", "2|3");
    params.set("release_date.gte", start);
    params.set("release_date.lte", end);
    params.set("sort_by", "primary_release_date.asc");
  }

  return (
    `https://api.themoviedb.org/3/discover/${mediaType}` +
    `?${params.toString()}`
  );
}

async function requestTMDB(url, headers) {
  const tmdbResponse = await fetch(url, { headers });
  const data = await tmdbResponse.json();

  if (!tmdbResponse.ok) {
    const error = new Error(
      data.status_message || "TMDB request failed."
    );

    error.status = tmdbResponse.status;
    throw error;
  }

  return data;
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

    // SEARCH MOVIES + TV
const searchQuery = String(request.query.search || "").trim();

if (searchQuery) {
  const encodedSearch = encodeURIComponent(searchQuery);

  const [movieData, tvData] = await Promise.all([
    requestTMDB(
      `https://api.themoviedb.org/3/search/movie?query=${encodedSearch}&include_adult=false&language=en-US&page=1`,
      headers
    ),
    requestTMDB(
      `https://api.themoviedb.org/3/search/tv?query=${encodedSearch}&include_adult=false&language=en-US&page=1`,
      headers
    )
  ]);

  const searchResults = [
    ...normalizeResults(movieData.results || [], "movie"),
    ...normalizeResults(tvData.results || [], "tv")
  ]
    .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0))
    .slice(0, 20);

  return response.status(200).json({
    results: searchResults
  });
}
    /*
      DETAIL REQUEST
// SEARCH MOVIES + TV
const searchQuery = String(request.query.search || "").trim();

if (searchQuery) {
  const encodedSearch = encodeURIComponent(searchQuery);

  const [movieData, tvData] = await Promise.all([
    requestTMDB(
      `https://api.themoviedb.org/3/search/movie?query=${encodedSearch}&include_adult=false&language=en-US&page=1`,
      headers
    ),
    requestTMDB(
      `https://api.themoviedb.org/3/search/tv?query=${encodedSearch}&include_adult=false&language=en-US&page=1`,
      headers
    )
  ]);

  const searchResults = [
    ...normalizeResults(movieData.results || [], "movie"),
    ...normalizeResults(tvData.results || [], "tv")
  ]
    .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0))
    .slice(0, 20);

  return response.status(200).json({
    results: searchResults
  });
}
      /api/tmdb?id=123&type=movie
    */
    if (request.query.id) {
      const id = String(request.query.id);
      const type = request.query.type === "tv" ? "tv" : "movie";

      const detailURL =
        `https://api.themoviedb.org/3/${type}/${id}` +
        "?language=en-US" +
        "&append_to_response=credits,videos,watch/providers";

      const data = await requestTMDB(detailURL, headers);

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

      const usProviders =
        data["watch/providers"]?.results?.US || {};

      return response.status(200).json({
        id: data.id,
        type,
        title: data.title || data.name || "Untitled",
        overview:
          data.overview || "No synopsis is available.",
        poster_path: data.poster_path,
        backdrop_path: data.backdrop_path,
        release_date:
          data.release_date ||
          data.first_air_date ||
          "",
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
      LIST AND FILTER REQUESTS

      Examples:

      /api/tmdb?category=theaters

      /api/tmdb?category=discover
        &provider=8
        &type=movie
        &sort=newest
        &date=month
    */
    const category = String(
      request.query.category || "trending"
    );

    const type = ["movie", "tv", "both"].includes(
      request.query.type
    )
      ? request.query.type
      : "both";

    const provider = request.query.provider
      ? String(request.query.provider)
      : "";

    const sort = allowedSorts[request.query.sort]
      ? request.query.sort
      : "popular";

    const date = ["week", "month", "year"].includes(
      request.query.date
    )
      ? request.query.date
      : "";

    const hasFilters =
      Boolean(provider) ||
      Boolean(date) ||
      request.query.sort ||
      request.query.type;

    /*
      COMING TO THEATERS
    */
    if (category === "theaters") {
      const url = buildDiscoverURL({
        type: "movie",
        provider: "",
        sort: "oldest",
        date: "",
        category: "theaters"
      });

      const data = await requestTMDB(url, headers);

      return response.status(200).json({
        results: normalizeResults(
          data.results,
          "movie"
        ).slice(0, 20)
      });
    }

    /*
      TRENDING WITHOUT FILTERS
    */
    if (category === "trending" && !hasFilters) {
      const trendingType =
        type === "movie"
          ? "movie"
          : type === "tv"
            ? "tv"
            : "all";

      const data = await requestTMDB(
        `https://api.themoviedb.org/3/trending/${trendingType}/day?language=en-US`,
        headers
      );

      return response.status(200).json({
        results: normalizeResults(data.results).slice(0, 20)
      });
    }

    /*
      EXISTING BASIC LISTS WITHOUT FILTERS
    */
    if (
      listEndpoints[category] &&
      !hasFilters &&
      type === "both"
    ) {
      const data = await requestTMDB(
        `https://api.themoviedb.org/3${listEndpoints[category]}?language=en-US&page=1`,
        headers
      );

      return response.status(200).json({
        results: normalizeResults(data.results).slice(0, 20)
      });
    }

    /*
      FILTERED DISCOVER RESULTS
    */
    const requestedTypes =
      type === "both"
        ? ["movie", "tv"]
        : [type];

    const requests = requestedTypes.map((mediaType) => {
      const url = buildDiscoverURL({
        type: mediaType,
        provider,
        sort,
        date,
        category
      });

      return requestTMDB(url, headers).then((data) =>
        normalizeResults(data.results, mediaType)
      );
    });

    const resultGroups = await Promise.all(requests);

    const combinedResults = sortCombinedResults(
      resultGroups.flat(),
      sort
    ).slice(0, 20);

    return response.status(200).json({
      results: combinedResults
    });
  } catch (error) {
    console.error(error);

    return response
      .status(error.status || 500)
      .json({
        error:
          error.message || "Unable to connect to TMDB."
      });
  }
}
