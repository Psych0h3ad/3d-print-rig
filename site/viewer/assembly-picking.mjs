import * as THREE from './vendor/three.module.js';
import {createSourcePicker} from './source-picking-core.mjs?v=ca04efe661ce9d571b7f';
export const createAssemblyPicker=options=>createSourcePicker(THREE,options);
