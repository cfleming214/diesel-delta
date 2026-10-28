import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** JSON storage for persisted Zustand stores. */
export const persistStorage = createJSONStorage(() => AsyncStorage);
