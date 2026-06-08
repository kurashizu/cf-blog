// Barrel exports for the JSNES component set. Integration with
// GadgetsPanel looks like:
//
//   import { NESPanel } from "@/components/nes";
//
//   const [showNes, setShowNes] = useState(false);
//   <NESPanel
//     expanded={showNes}
//     onExpand={() => setShowNes(true)}
//     onCollapse={() => setShowNes(false)}
//   />
export { NESPanel } from "./NESPanel";
export { ROMS, LOCAL_ROMS, REMOTE_ROMS, findRom } from "./roms";
export type { Rom, LoadStatus } from "./types";
