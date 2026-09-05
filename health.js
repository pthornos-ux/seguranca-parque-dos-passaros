module.exports = async (req, res) => {
  try {
    const token = process.env.AIRTABLE_TOKEN;
    if (!token) return res.status(500).json({ok:false,airtable:false,erro:'AIRTABLE_TOKEN ausente'});
    const r = await fetch('https://api.airtable.com/v0/appgzi6kB9pQnSoSw/tblYTP6X27lCQkSuF?maxRecords=1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) return res.status(502).json({ok:false,airtable:false,status:r.status});
    return res.status(200).json({ok:true,airtable:true,sistema:'Parque dos Pássaros — Adesões Airtable'});
  } catch (e) {
    return res.status(500).json({ok:false,airtable:false,erro:'Falha de conexão'});
  }
};
