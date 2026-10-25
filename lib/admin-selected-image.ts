import type {ChangeEvent} from "react";
export function adminSelectedImage(value: File | ChangeEvent<HTMLInputElement>): File | null {
  if ("target" in value) {
    const file=value.target.files?.[0]??null;
    value.target.value="";
    return file;
  }
  return value;
}
