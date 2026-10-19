import { createRoot } from "react-dom/client";
import { AdminDataQualityDashboard } from "../../../../components/admin-data-quality-dashboard";
import type { DataQualityDashboard } from "../../../../lib/data-quality-store";
import "../../../../app/admin/admin-legacy-scoped.css";
import "../../../../app/admin/admin-workspace.css";

// All entities and keys are synthetic. No auth, D1, Notion, R2 or production data.
const now = "2026-10-18T14:30:00Z";
const media = [
  { monitor: { id: 101, entityType: "DIRECTORY_PROFILE", status: "CHANGED", activeImageKey: "fixture/old-luna.svg", candidateImageKey: "fixture/new-luna.svg", sourceImageUrl: "https://example.invalid/luna", candidateImageUrl: "https://example.invalid/new-luna", lastCheckedAt: now }, label: "Psí salón Luna", href: "#luna", category: "salony" },
  { monitor: { id: 102, entityType: "MANAGED_EVENT", status: "CANDIDATE", activeImageKey: null, candidateImageKey: "fixture/event.svg", sourceImageUrl: null, candidateImageUrl: "https://example.invalid/event", lastCheckedAt: now }, label: "Deň so psami", href: "#event", category: "podujatia" },
  { monitor: { id: 103, entityType: "DIRECTORY_PROFILE", status: "CHANGED", activeImageKey: "fixture/old-vet.svg", candidateImageKey: "fixture/new-vet.svg", sourceImageUrl: null, candidateImageUrl: null, lastCheckedAt: now }, label: "Veterina Javor", href: "#vet", category: "veterinari" },
  { monitor: { id: 104, entityType: "DIRECTORY_PROFILE", status: "MISSING", activeImageKey: null, candidateImageKey: null, sourceImageUrl: null, candidateImageUrl: null, lastCheckedAt: null }, label: "Psí hotel Les", href: "#hotel", category: "hotely" },
];
const emptyPage = {page:1,pageSize:50,totalItems:0,totalPages:1,from:0,to:0};
const ok = {status:"AVAILABLE",errorRef:null};
const data = {
  availability:{status:"AVAILABLE",errorRefs:[]}, monitorReady:true, profiles:[], media,
  summary:{totalProfiles:4,profilesWithIssues:0,missingDescription:0,missingPhone:0,missingEmail:0,missingWebsite:0,missingImage:1,incompleteAddress:0,mediaIssues:4,changedMedia:3,missingMediaSource:1},
  profilePagination:emptyPage,
  mediaPagination:{page:1,pageSize:50,totalItems:4,totalPages:1,from:1,to:4},
  category:"all",categoryOptions:[{value:"all",label:"Všetky kategórie"},{value:"salony",label:"Salóny"},{value:"podujatia",label:"Podujatia"}],
  issue:"all",issueOptions:[],profileStatus:"all",profileStatusOptions:[],priority:"all",priorityOptions:[],solution:"all",solutionOptions:[],
  query:"",region:"",district:"",regionOptions:[],districtOptions:[],
  mediaStatus:"review",mediaStatusOptions:[{value:"all",label:"Všetky stavy obrázkov"},{value:"review",label:"Na schválenie"}],
  sections:{profiles:ok,suggestions:ok,media:ok,lookups:ok},
} as unknown as DataQualityDashboard;
createRoot(document.getElementById("root")!).render(
  <div data-admin-workspace><main id="obsah"><AdminDataQualityDashboard data={data}/></main></div>
);
