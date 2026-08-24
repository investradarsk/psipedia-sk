export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  parentId: string | null;
  position: number;
  visible: boolean;
};

export const defaultNavigationItems: NavigationItem[] = [
  { id: "novinky", label: "Novinky zo sveta psov", href: "/novinky", parentId: null, position: 0, visible: true },
  { id: "steniatka", label: "Šteniatka", href: "/steniatka", parentId: null, position: 1, visible: true },
  { id: "plemena", label: "Plemená", href: "/plemena", parentId: null, position: 2, visible: true },
  { id: "starostlivost", label: "Zdravie a starostlivosť", href: "/starostlivost", parentId: null, position: 3, visible: true },
  { id: "aktivity", label: "Výcvik a aktivity", href: "/aktivity", parentId: null, position: 4, visible: true },
  { id: "adresar", label: "Služby pre psov", href: "/adresar", parentId: null, position: 5, visible: true },
  { id: "podujatia", label: "Podujatia", href: "/podujatia", parentId: null, position: 6, visible: true },
  { id: "pomoc-psom", label: "Pomoc psom", href: "/pomoc-psom", parentId: null, position: 7, visible: true },
  { id: "recenzie", label: "Recenzie a testy", href: "/recenzie", parentId: null, position: 8, visible: true },
];
