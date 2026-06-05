// Temporary — tests SAM.gov entity API access. Delete after one run.
export default async () => {
  const key = process.env.SAM_API_KEY || "";
  if (!key) return new Response(JSON.stringify({ error: "SAM_API_KEY not set" }), { status: 500 });

  const url = `https://api.sam.gov/entity-information/v3/entities?api_key=${key}&ueiSAM=YVNXN3XBUSD5&includeSections=entityRegistration,coreData,assertions`;

  try {
    const res  = await fetch(url);
    const text = await res.text();
    let preview = "";
    try {
      const parsed = JSON.parse(text);
      // Return only safe metadata — never echo the key back
      const entity = parsed?.entityData?.[0];
      preview = JSON.stringify({
        totalRecords:    parsed?.totalRecords,
        legalName:       entity?.entityRegistration?.legalBusinessName,
        uei:             entity?.entityRegistration?.ueiSAM,
        hasNaics:        !!entity?.assertions?.goodsAndServices?.naicsList?.length,
        hasBusinessTypes:!!entity?.coreData?.entityHierarchyModel,
        rawKeys:         parsed ? Object.keys(parsed) : [],
      });
    } catch {
      preview = text.slice(0, 400);
    }
    return new Response(JSON.stringify({ httpStatus: res.status, preview }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
