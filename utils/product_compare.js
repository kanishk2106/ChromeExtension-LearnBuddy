function canonicalTitle(title = '') {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePrice(raw = '') {
  if (typeof raw === 'number') return raw;
  const match = (raw || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : NaN;
}

function siteFromLink(link = '') {
  try {
    return new URL(link).host || '';
  } catch (err) {
    return '';
  }
}

export function compareProducts(products = []) {
  const groups = new Map();
  for (const product of products) {
    if (!product?.title) continue;
    const key = canonicalTitle(product.title);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    const entry = {
      ...product,
      site: product.site || siteFromLink(product.link),
      priceValue: parsePrice(product.price),
      ratingValue: Number(product.rating) || 0,
      features: (product.features || []).map(f => f.toLowerCase())
    };
    groups.get(key).push(entry);
  }

  const insights = [];
  for (const [, items] of groups.entries()) {
    if (items.length < 2) continue;
    const priced = items.filter(item => Number.isFinite(item.priceValue));
    if (!priced.length) continue;
    const withScores = priced.map(item => {
      const scoreDetails = calculateScore(item, priced);
      return {
        ...item,
        score: scoreDetails.score,
        scoreDetails
      };
    }).sort((a, b) => b.score - a.score);

    const best = withScores[0];
    const runnerUp = withScores[1] || priced[1];
    let savings = '';
    if (runnerUp && Number.isFinite(runnerUp.priceValue)) {
      const diff = runnerUp.priceValue - best.priceValue;
      if (diff > 0) {
        savings = `Save ${runnerUp.currency || '$'}${diff.toFixed(2)} compared to ${runnerUp.site}`;
      }
    }
    insights.push({
      title: best.title,
      bestSite: best.site,
      bestPrice: best.priceValue,
      currency: best.currency || runnerUp?.currency || '$',
      link: best.link,
      comparison: savings,
      score: best.score,
      scoredItems: withScores.slice(0, 3).map(item => ({
        title: item.title,
        site: item.site,
        priceValue: item.priceValue,
        priceText: item.price,
        currency: item.currency,
        rating: item.ratingValue,
        features: item.features,
        score: Number(item.score.toFixed(2)),
        scoreDetails: item.scoreDetails,
        link: item.link
      }))
    });
  }

  return insights;
}

function calculateScore(item, group) {
  const maxPrice = Math.max(...group.map(g => g.priceValue));
  const minPrice = Math.min(...group.map(g => g.priceValue));
  const priceRange = Math.max(1, maxPrice - minPrice);
  const priceNormalized = (item.priceValue - minPrice) / priceRange;
  const ratingScore = item.ratingValue ? item.ratingValue * 2 : 0;
  const priceScore = 1 - priceNormalized;
  const featureScore = Math.min(1.5, (item.features?.length || 0) * 0.2);
  const score = ratingScore + priceScore * 0.5 + featureScore;
  return {
    score,
    ratingScore,
    priceScore: priceScore * 0.5,
    featureScore,
    priceNormalized
  };
}

export function summarizeBestDeal(insights = []) {
  if (!Array.isArray(insights) || !insights.length) return null;
  const top = insights[0];
  const price = Number.isFinite(top.bestPrice) ? top.bestPrice.toFixed(2) : top.bestPrice;
  const summary = `Best deal: ${top.title} on ${top.bestSite || 'this site'} for ${top.currency}${price}`;
  return top.comparison ? `${summary} (${top.comparison})` : summary;
}
