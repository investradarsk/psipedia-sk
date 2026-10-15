import {FacebookImageConflict,FacebookImageSchemaUnavailable} from "@/lib/facebook-image-store";
export function facebookImageError(error:unknown) {
  return Response.json({error:error instanceof Error?error.message:"Operácia zlyhala."},{status:error instanceof FacebookImageSchemaUnavailable?503:error instanceof FacebookImageConflict?409:400});
}
