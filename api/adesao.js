const BASE='appgzi6kB9pQnSoSw';
const TABLE='tblYTP6X27lCQkSuF';
const API=`https://api.airtable.com/v0/${BASE}/${TABLE}`;
const headers=()=>({Authorization:`Bearer ${process.env.AIRTABLE_TOKEN}`,'Content-Type':'application/json'});
const digits=s=>(s||'').replace(/\D/g,'');
const esc=s=>String(s||'').replace(/'/g,"\\'");

module.exports = async (req,res)=>{
  if(req.method!=='POST') return res.status(405).json({ok:false,erro:'Método não permitido'});
  try{
    const {nome,cpf,endereco,whatsapp,email,termo,lgpd,submissionId}=req.body||{};
    if(!process.env.AIRTABLE_TOKEN) return res.status(500).json({ok:false,erro:'Configuração indisponível'});
    if(!nome||!cpf||!endereco||!whatsapp||!email||!submissionId||termo!==true||lgpd!==true)
      return res.status(400).json({ok:false,erro:'Preencha todos os campos e confirme os aceites.'});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ok:false,erro:'E-mail inválido.'});
    const dc=digits(cpf); if(dc.length!==11&&dc.length!==14) return res.status(400).json({ok:false,erro:'CPF/CNPJ inválido.'});

    const dup=await fetch(`${API}?maxRecords=1&filterByFormula=${encodeURIComponent(`{Submission ID}='${esc(submissionId)}'`)}`,{headers:headers()});
    if(dup.ok){ const j=await dup.json(); if(j.records?.length){
      const f=j.records[0].fields||{}; return res.status(200).json({ok:true,codigo:f['Código']||'Registrado',duplicado:true});
    }}

    let offset, max=0;
    do{
      const u=new URL(API); u.searchParams.set('pageSize','100'); u.searchParams.append('fields[]','Código'); if(offset)u.searchParams.set('offset',offset);
      const r=await fetch(u,{headers:headers()}); if(!r.ok) throw new Error('airtable-read');
      const j=await r.json(); offset=j.offset;
      for(const rec of j.records||[]){ const m=String(rec.fields?.['Código']||'').match(/PP-2026-(\d+)/); if(m) max=Math.max(max,Number(m[1])); }
    }while(offset);
    const codigo=`PP-2026-${String(max+1).padStart(4,'0')}`;
    const fields={
      'Código':codigo,
      'Data/Hora':new Date().toISOString(),
      'Nome completo':String(nome).trim(),
      'CPF/CNPJ':String(cpf).trim(),
      'Endereço':String(endereco).trim(),
      'WhatsApp':String(whatsapp).trim(),
      'E-mail':String(email).trim(),
      'Aceite Termo v1.5':true,
      'Ciência LGPD':true,
      'Status pagamento':'Aguardando pagamento',
      'Valor':500,
      'Submission ID':String(submissionId),
      'Versão do Termo':'v1.5 — SEM SAPP'
    };
    const wr=await fetch(API,{method:'POST',headers:headers(),body:JSON.stringify({records:[{fields}],typecast:true})});
    if(!wr.ok){console.error('Airtable write failed',wr.status,await wr.text()); throw new Error('airtable-write');}
    return res.status(200).json({ok:true,codigo,status:'Aguardando pagamento'});
  }catch(e){ console.error(e); return res.status(500).json({ok:false,erro:'Não foi possível registrar a adesão. Tente novamente.'}); }
};
