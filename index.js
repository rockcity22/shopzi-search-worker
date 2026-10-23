export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...cors,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/" || path === "/health") {
      return json({
        service: "SHOPZI Search",
        status: "ok",
        endpoints: [
          "/health",
          "/search?q=books&country=UG"
        ],
        searchConfigured: Boolean(env.SERPAPI_KEY),
      });
    }

    if (path !== "/search") {
      return json({ error: "Endpoint not found" }, 404);
    }

    const query = (url.searchParams.get("q") || "").trim();

    if (!query) {
      return json({
        error: "Enter a product to search for",
        example: "/search?q=books&country=UG",
      }, 400);
    }

    if (query.length > 150) {
      return json({ error: "Search query is too long" }, 400);
    }

    if (!env.SERPAPI_KEY) {
      return json({
        error: "Search is not configured. Add SERPAPI_KEY to this Worker.",
      }, 503);
    }

    const countryInput = (
      url.searchParams.get("country") || "UG"
    ).trim().toUpperCase();

    const countries = {
      UG: "ug",
      US: "us",
      GB: "uk",
      UK: "uk",
      CA: "ca",
      AU: "au",
      KE: "ke",
      TZ: "tz",
      RW: "rw",
      NG: "ng",
      ZA: "za",
      IN: "in",
    };

    const searchUrl = new URL(
      "https://serpapi.com/search.json"
    );

    searchUrl.searchParams.set(
      "engine",
      "google_shopping"
    );
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set(
      "gl",
      countries[countryInput] || "ug"
    );
    searchUrl.searchParams.set("hl", "en");
    searchUrl.searchParams.set(
      "api_key",
      env.SERPAPI_KEY
    );

    try {
      const upstream = await fetch(searchUrl.toString(), {
        headers: { Accept: "application/json" },
      });

      if (!upstream.ok) {
        return json({
          error: "The product search provider could not complete the search.",
        }, 502);
      }

      const data = await upstream.json();

      if (data.error) {
        return json({
          error: "The product search provider returned an error.",
        }, 502);
      }

      const configured = Number(
        env.SHOPZI_MARKUP_PERCENT ?? "15"
      );

      const markup =
        Number.isFinite(configured) &&
        configured >= 0 &&
        configured <= 200
          ? configured
          : 15;

      const results = Array.isArray(data.shopping_results)
        ? data.shopping_results
        : [];

      const products = results.map((item, index) => {
        const price = Number(item.extracted_price);

        const hasPrice =
          item.extracted_price !== undefined &&
          item.extracted_price !== null &&
          Number.isFinite(price) &&
          price >= 0;

        const sellingPrice = hasPrice
          ? Number(
              (price * (1 + markup / 100)).toFixed(2)
            )
          : null;

        return {
          id: String(
            item.product_id ||
            item.position ||
            index + 1
          ),
          name: item.title || "Product",
          description: item.snippet || "",
          image: item.thumbnail || null,
          price: sellingPrice,
          displayedPrice:
            sellingPrice === null
              ? item.price || null
              : null,
          currency: item.currency || null,
          rating: item.rating ?? null,
          reviews: item.reviews ?? null,
          seller: item.source || "External seller",
          shipping: item.delivery || null,
          productUrl:
            item.product_link || item.link || null,
          country: countryInput,
          priceIncludesShopziMarkup: hasPrice,
        };
      });

      return json({
        service: "SHOPZI Search",
        query,
        country: countryInput,
        markupPercent: markup,
        count: products.length,
        note: "Prices and availability are search-result estimates. Confirm seller price, shipping, stock, and fulfilment before accepting payment.",
        products,
      });

    } catch {
      return json({
        error: "An unexpected search error occurred.",
      }, 500);
    }
  },
};
