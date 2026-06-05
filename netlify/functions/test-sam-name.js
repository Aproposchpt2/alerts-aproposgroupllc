// Temporary — SAM entity name-search test. Delete after one run.
exports.handler = async () => {
  const key = process.env.SAM_API_KEY || "";
  if (!key) return { statusCode: 500, body: JSON.stringify({ error: "SAM_API_KEY not set" }) };

  const params = new URLSearchParams({
    api_key: key,
    q: "Apropos Group LLC",
    registrationStatus: "A",
    includeSections: "entityRegistration"
  });

  try {
    const res  = await fetch("https://api.sam.gov/entity-information/v3/entities?" + params.toString());
    const text = await res.text();
    let out = { httpStatus: res.status };
    try {
      const parsed = JSON.parse(text);
      out.totalRecords = parsed.totalRecords;
      out.entities = (parsed.entityData || []).map(function(e) {
        return {
          legalName: e.entityRegistration && e.entityRegistration.legalBusinessName,
          uei:       e.entityRegistration && e.entityRegistration.ueiSAM,
          status:    e.entityRegistration && e.entityRegistration.registrationStatus,
          expiry:    e.entityRegistration && e.entityRegistration.registrationExpirationDate,
        };
      });
    } catch(pe) { out.rawPreview = text.slice(0, 600); }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out, null, 2) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
