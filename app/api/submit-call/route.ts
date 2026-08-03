import { env } from "cloudflare:workers";

const API = "https://services.leadconnectorhq.com";
const PIPELINE_NAME = "GUIDE Partner Call Assistant";

function stageForOutcome(outcome?: string) {
  switch (outcome) {
    case "Meeting Scheduled": return "Meeting Booked";
    case "Interested, follow up needed": return "Contacted";
    case "Not interested": return "Not Interested";
    case "No answer / Voicemail": return "Outreach Attempted";
    case "Not private duty": return "Disqualified";
    default: return "New Lead";
  }
}

async function ghl(path:string, init:RequestInit = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers:{
      Authorization:`Bearer ${env.GHL_PRIVATE_TOKEN}`,
      Version:"2021-07-28",
      Accept:"application/json",
      "Content-Type":"application/json",
      ...(init.headers || {})
    }
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error((data as {message?:string}).message || `HighLevel request failed (${response.status})`);
  return data as Record<string,unknown>;
}

export async function POST(request:Request) {
  try {
    const call = await request.json() as Record<string,string>;
    if (!call.agency || (!call.phone && !call.email)) return Response.json({error:"Agency and phone or email are required"},{status:400});
    const names=(call.contact || "").trim().split(/\s+/).filter(Boolean);
    const contactResult=await ghl("/contacts/upsert",{method:"POST",body:JSON.stringify({
      locationId:env.GHL_LOCATION_ID,
      firstName:names[0] || call.agency,
      lastName:names.slice(1).join(" "),
      companyName:call.agency,
      address1:call.address || undefined,
      website:call.website || undefined,
      phone:call.phone || undefined,
      email:call.email || undefined,
      source:"GUIDE Partner Call Assistant",
      tags:["GUIDE Model Outreach", call.interest ? `${call.interest} Lead` : "", call.outcome || ""].filter(Boolean)
    })});
    const contact=(contactResult.contact || contactResult) as {id?:string};
    if(!contact.id) throw new Error("HighLevel did not return a contact ID");

    const pipelineResult=await ghl(`/opportunities/pipelines?locationId=${encodeURIComponent(env.GHL_LOCATION_ID)}`);
    const pipelines=(pipelineResult.pipelines || []) as Array<{id:string;name:string;stages:Array<{id:string;name:string}>}>;
    const pipeline=pipelines.find(p=>p.name===PIPELINE_NAME);
    if(!pipeline) throw new Error(`${PIPELINE_NAME} pipeline was not found`);
    const stageName=stageForOutcome(call.outcome);
    const stage=pipeline.stages.find(s=>s.name===stageName) || pipeline.stages[0];
    await ghl("/opportunities/upsert",{method:"POST",body:JSON.stringify({
      locationId:env.GHL_LOCATION_ID,
      contactId:contact.id,
      pipelineId:pipeline.id,
      pipelineStageId:stage.id,
      name:`${call.agency} — GUIDE Partnership`,
      status:["Not Interested","Disqualified"].includes(stageName) ? "lost" : "open"
    })});

    if(call.nextAction) {
      const due=new Date(Date.now()+7*86400000).toISOString();
      await ghl(`/contacts/${contact.id}/tasks`,{method:"POST",body:JSON.stringify({title:call.nextAction,dueDate:due,completed:false})}).catch(()=>null);
    }
    return Response.json({ok:true,contactId:contact.id,pipelineId:pipeline.id,stage:stage.name});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : "Submission failed"},{status:502});
  }
}
