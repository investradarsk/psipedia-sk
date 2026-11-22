import type { ReactElement } from "react";
import {
  Activity, Dog, GraduationCap, Grid2X2, House, Hotel, PawPrint,
  Plus, Scissors, Stethoscope, UsersRound, Footprints,
} from "lucide-react";
import {
  PublicSubcategoryNavigator,
  type PublicSubcategoryItem,
} from "@/components/public-visual-system";
import styles from "./directory-public.module.css";

/** One icon per service category; these are presentation-only, never URL data. */
const icons: Record<string, ReactElement> = {
  "/adresar": <Grid2X2 size={18} />,
  "/adresar/veterinari": <Stethoscope size={18} />,
  "/adresar/treneri": <GraduationCap size={18} />,
  "/adresar/kynologicke-kluby": <UsersRound size={18} />,
  "/adresar/chovatelske-kluby": <Dog size={18} />,
  "/adresar/chovatelske-stanice": <House size={18} />,
  "/adresar/salony-a-sluzby": <Scissors size={18} />,
  "/adresar/hotely-a-opatrovanie": <Hotel size={18} />,
  "/adresar/vencenie": <Footprints size={18} />,
  "/adresar/fyzioterapia": <Activity size={18} />,
  "/adresar/dalsie-sluzby": <Plus size={18} />,
};

/** Same fully visible category navigation as Help and Events on every viewport. */
export function DirectoryCategoryNavigation({ items }: { items: PublicSubcategoryItem[] }) {
  return (
    <div className={styles.sharedCategoryNavigation} data-directory-category-navigation data-directory-category-nav>
      <PublicSubcategoryNavigator
        mode="compact"
        mobileLayout="grid"
        columns={6}
        items={items.map((item) => ({ ...item, icon: item.icon ?? icons[item.href] ?? <PawPrint size={18} /> }))}
        label="Kategórie služieb pre psov"
      />
    </div>
  );
}
