import {requirePartnerAdminMutation} from "@/lib/partner-admin-api";
import {createPartnerCommercialAgreementFromLead,PartnerCommercialAgreementError} from "@/lib/partner-commercial-agreements";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  const auth=await requirePartnerAdminMutation(request);if(auth.response)return auth.response;
  try{
    const body=await request.json() as Record<string,unknown>;
    const agreement=await createPartnerCommercialAgreementFromLead({
      interestId:typeof body.interestId==="string"?body.interestId:"",
      priceCents:body.priceCents,currency:body.currency,paymentMethod:body.paymentMethod,
      startAt:body.startAt,endAt:body.endAt,partnerNote:body.partnerNote,
      paymentInstruction:body.paymentInstruction,adminNote:body.adminNote,adminEmail:auth.user.email,
    });
    return Response.json({agreement},{status:201});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"Dohodu sa nepodarilo vytvoriť."},{status:error instanceof PartnerCommercialAgreementError?error.status:400});
  }
}
