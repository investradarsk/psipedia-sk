export function useRouter() { return {push:(href:string)=>location.assign(href)}; }
export function usePathname() { return location.pathname; }
