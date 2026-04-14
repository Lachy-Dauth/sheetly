/**
 * Central installer: wires every category into the registry exactly once.
 */

import { installMath } from './math';
import { installStats } from './stats';
import { installLogical } from './logical';
import { installText } from './text';
import { installDateTime } from './datetime';
import { installLookup } from './lookup';
import { installInfo } from './info';
import { installFinancial } from './financial';
import { installArrays } from './array';

export function installAllFunctions(): void {
  installMath();
  installStats();
  installLogical();
  installText();
  installDateTime();
  installLookup();
  installInfo();
  installFinancial();
  installArrays();
}
