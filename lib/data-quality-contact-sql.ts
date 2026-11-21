/**
 * Directory Data Quality: canonical SQL contacts only. The one-time Notion
 * import already populated SQL; no legacy source_data_json read is allowed.
 * SQL NULL and intentionally cleared empty strings both count as missing.
 */
type ContactField = "phone" | "email" | "website";
const columns: Record<ContactField,string> = {
  phone:"public_phone",email:"public_email",website:"website_url",
};
// SQLite's ordinary trim ignores several Unicode whitespace characters.
const whitespace = "char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)";
export function missingDirectoryContactSql(field:ContactField):string {
  const column=columns[field];
  return `NULLIF(trim(CAST(${column} AS TEXT), ${whitespace}), '') IS NULL`;
}
export const RAW_MISSING_PHONE_SQL=missingDirectoryContactSql("phone");
export const RAW_MISSING_EMAIL_SQL=missingDirectoryContactSql("email");
export const RAW_MISSING_WEBSITE_SQL=missingDirectoryContactSql("website");
