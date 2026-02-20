class GithubAPI {
  constructor() {
    this.cache_key = "fetchCache";
  }
  #loadCache() {
    return JSON.parse(localStorage.getItem(this.cache_key)) || {};
  }

  #saveCache(cache) {
    localStorage.setItem(this.cache_key, JSON.stringify(cache));
  }
  async fetchJSONWithCache(url) {
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;
    let cacheMap = this.#loadCache();

    if (cacheMap[url] && now - cacheMap[url].timestamp < thirtyMinutes) {
      return cacheMap[url].data;
    }

    const result = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    const json = await result.json();

    cacheMap[url] = { data: json, timestamp: now };
    this.#saveCache(cacheMap);

    return json;
  }
}

export default GithubAPI;