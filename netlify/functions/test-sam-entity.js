// Temporary — tests SAM.gov entity API access. Delete after one run.
exports.handler = async () => {
  const key = process.env.SAM_API_KEY || "";
  if (!key) return { statusCode: 500, body: JSON.stringify({ error: "SAM_API_KEY not set" }) };

  const url = `https://api.sam.gov/entity-information/v3/entities?api_key=${key}&ueiSAM=YVNXN3XBUSD5&includeSections=entityRegistration,coreData,assertions`;

  try {
    const res  = await fetch(url);
    const text = await res.text();
    let preview = {};
    try {
      const parsed = JSON.parse(text);
      const entity = parsed?.entityData?.[0];
      preview = {
        httpStatus:      res.status,
        totalRecords:    parsed?.totalRecords,
        legalName:       entity?.entityRegistration?.legalBusinessName || null,
        uei:             entity?.entityRegistration?.ueiSAM || null,
        hasNaics:        !!(entity?.assertions?.goodsAndServices?.naicsList?.length),
        hasBusinessTypes:!!(entity?.coreData?.businessTypes),
        topLevelKeys:    Object.keys(parsed || {}),
      };
    } catch {
      preview = { httpStatus: res.status, rawPreview: text.slice(0, 300) };
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(preview) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
