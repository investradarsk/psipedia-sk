import {requirePartnerAdminMutation} from "@/lib/partner-admin-api";
import {
  activatePartnerCommercialAgreement,cancelPartnerCommercialAgreement,markPartnerCommercialAgreementPaid,
  pausePartnerCommercialEntitlement,PartnerCommercialAgreementError,updatePartnerCommercialAgreementAdmin,
  waivePartnerCommercialAgreementPayment,
} from "@/lib/partner-commercial-agreements";
export const dynamic="force-dynamic";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requirePartnerAdminMutation(request);if(auth.response)return auth.response;
  try{
    const {id}=await params,body=await request.json() as Record<string,unknown>,action=typeof body.action==="string"?body.action:"update";
    const common={id,adminEmail:auth.user.email};
    const agreement=action==="mark_paid"?await markPartnerCommercialAgreementPaid(common)
      :action==="waive_payment"?await waivePartnerCommercialAgreementPayment(common)
      :action==="activate"?await activatePartnerCommercialAgreement({...common,campaignId:body.campaignId})
      :action==="pause"?await pausePartnerCommercialEntitlement({agreementId:id,adminEmail:auth.user.email})
      :action==="cancel"?await cancelPartnerCommercialAgreement(common)
      :await updatePartnerCommercialAgreementAdmin({...common,status:body.status,priceCents:body.priceCents,currency:body.currency,
        paymentMethod:body.paymentMethod,startAt:body.startAt,endAt:body.endAt,partnerNote:body.partnerNote,
        paymentInstruction:body.paymentInstruction,adminNote:body.adminNote});
    return Response.json({agreement});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"Zmena dohody zlyhala."},{status:error instanceof PartnerCommercialAgreementError?error.status:400});
  }
}
