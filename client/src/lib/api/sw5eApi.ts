import axios, { AxiosError, AxiosRequestConfig } from "axios";
import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
  QueryKey,
} from "@tanstack/react-query";
import { z } from "zod";

// Base API configuration
const api = axios.create({
  baseURL: "/api/sw5e",
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor for auth tokens
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Error handling helper
export class ApiError extends Error {
  status: number;
  data?: any;

  constructor(error: AxiosError) {
    super(error.message);
    this.name = "ApiError";
    this.status = error.response?.status || 500;
    this.data = error.response?.data;
  }
}

// Generic fetch function
const fetchData = async <T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> => {
  try {
    const response = await api.get<T>(url, config);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new ApiError(error);
    }
    throw error;
  }
};

// Generic mutation function
const mutateData = async <T>({
  url,
  method,
  data,
}: {
  url: string;
  method: "POST" | "PUT" | "DELETE";
  data?: any;
}): Promise<T> => {
  try {
    const response = await api[
      method.toLowerCase() as "post" | "put" | "delete"
    ]<T>(url, data);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new ApiError(error);
    }
    throw error;
  }
};

// TypeScript Interfaces
export interface Species {
  id: string;
  name: string;
  abilityScoreIncrease: Record<string, number>;
  size: "Tiny" | "Small" | "Medium" | "Large";
  speed: number;
  traits: SpeciesTrait[];
}

export interface SpeciesTrait {
  id: string;
  name: string;
  description: string;
}

export interface Class {
  id: string;
  name: string;
  hitDie: number;
  primaryAbility: string[];
  savingThrows: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  skillChoices: string[];
  numSkillChoices: number;
  startingEquipment: string[];
  classFeatures: ClassFeature[];
}

export interface ClassFeature {
  id: string;
  name: string;
  level: number;
  description: string;
}

export interface Background {
  id: string;
  name: string;
  description: string;
  skillProficiencies: string[];
  toolProficiencies: string[];
  languages: string[];
  equipment: string[];
  featureDescription: string;
  suggestedCharacteristics: Record<string, string[]>;
}

export interface Power {
  id: string;
  name: string;
  powerType: "Force" | "Tech";
  powerLevel: number;
  castingPeriod: string;
  range: string;
  duration: string;
  description: string;
  atHigherLevels?: string;
}

export interface Equipment {
  id: string;
  name: string;
  category: string;
  cost: number;
  weight: number;
  description: string;
  properties?: string[];
}

export interface Feat {
  id: string;
  name: string;
  prerequisites?: string[];
  description: string;
  benefits: string[];
}

export interface Character {
  id: string;
  userId: string;
  name: string;
  species: string;
  class: string;
  level: number;
  background: string;
  alignment: string;
  experiencePoints: number;
  abilities: Record<string, number>;
  skills: Record<string, boolean>;
  hitPoints: {
    current: number;
    maximum: number;
  };
  equipment: string[];
  powers: string[];
  feats: string[];
  credits: number;
  biography: string;
  appearance: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
}

// Query Keys
export const queryKeys = {
  species: "species",
  classes: "classes",
  backgrounds: "backgrounds",
  powers: (type?: string) => ["powers", type],
  equipment: (params?: PaginationParams) => ["equipment", params],
  feats: "feats",
  character: (id?: string) => ["character", id],
  characters: "characters",
};

// API Hooks

// Species
const fetchSpecies = () => fetchData<Species[]>("/species");

export const useSpecies = (options?: UseQueryOptions<Species[], ApiError>) => {
  return useQuery<Species[], ApiError>(
    [queryKeys.species],
    fetchSpecies,
    options,
  );
};

// Classes
const fetchClasses = () => fetchData<Class[]>("/classes");

export const useClasses = (options?: UseQueryOptions<Class[], ApiError>) => {
  return useQuery<Class[], ApiError>(
    [queryKeys.classes],
    fetchClasses,
    options,
  );
};

// Class by ID
const fetchClassById = (id: string) => fetchData<Class>(`/classes/${id}`);

export const useClass = (
  id: string,
  options?: UseQueryOptions<Class, ApiError>,
) => {
  return useQuery<Class, ApiError>(
    [...queryKeys.classes, id],
    () => fetchClassById(id),
    {
      enabled: !!id,
      ...options,
    },
  );
};

// Backgrounds
const fetchBackgrounds = () => fetchData<Background[]>("/backgrounds");

export const useBackgrounds = (
  options?: UseQueryOptions<Background[], ApiError>,
) => {
  return useQuery<Background[], ApiError>(
    [queryKeys.backgrounds],
    fetchBackgrounds,
    options,
  );
};

// Powers
const fetchPowers = (type?: "force" | "tech") =>
  fetchData<Power[]>(type ? `/powers/${type}` : "/powers");

export const usePowers = (
  type?: "force" | "tech",
  options?: UseQueryOptions<Power[], ApiError>,
) => {
  return useQuery<Power[], ApiError>(
    queryKeys.powers(type),
    () => fetchPowers(type),
    options,
  );
};

// Equipment with pagination
const fetchEquipment = (params: PaginationParams = {}) =>
  fetchData<PaginatedResponse<Equipment>>("/equipment", { params });

export const useEquipment = (
  params: PaginationParams = {},
  options?: UseQueryOptions<PaginatedResponse<Equipment>, ApiError>,
) => {
  return useQuery<PaginatedResponse<Equipment>, ApiError>(
    queryKeys.equipment(params),
    () => fetchEquipment(params),
    options,
  );
};

// Feats
const fetchFeats = () => fetchData<Feat[]>("/feats");

export const useFeats = (options?: UseQueryOptions<Feat[], ApiError>) => {
  return useQuery<Feat[], ApiError>([queryKeys.feats], fetchFeats, options);
};

// Character Management

// Get character by ID
const fetchCharacter = (id: string) => fetchData<Character>(`/character/${id}`);

export const useCharacter = (
  id: string,
  options?: UseQueryOptions<Character, ApiError>,
) => {
  return useQuery<Character, ApiError>(
    queryKeys.character(id),
    () => fetchCharacter(id),
    {
      enabled: !!id,
      ...options,
    },
  );
};

// Get all characters for current user
const fetchUserCharacters = () => fetchData<Character[]>("/characters");

export const useUserCharacters = (
  options?: UseQueryOptions<Character[], ApiError>,
) => {
  return useQuery<Character[], ApiError>(
    [queryKeys.characters],
    fetchUserCharacters,
    options,
  );
};

// Create character
const createCharacter = (
  data: Omit<Character, "id" | "createdAt" | "updatedAt">,
) => mutateData<Character>({ url: "/character", method: "POST", data });

export const useCreateCharacter = (
  options?: UseMutationOptions<
    Character,
    ApiError,
    Omit<Character, "id" | "createdAt" | "updatedAt">
  >,
) => {
  const queryClient = useQueryClient();

  return useMutation<
    Character,
    ApiError,
    Omit<Character, "id" | "createdAt" | "updatedAt">
  >(createCharacter, {
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.character(data.id), data);
      queryClient.invalidateQueries([queryKeys.characters]);
    },
    ...options,
  });
};

// Update character
const updateCharacter = ({
  id,
  ...data
}: { id: string } & Partial<
  Omit<Character, "id" | "createdAt" | "updatedAt">
>) => mutateData<Character>({ url: `/character/${id}`, method: "PUT", data });

export const useUpdateCharacter = (
  options?: UseMutationOptions<
    Character,
    ApiError,
    { id: string } & Partial<Omit<Character, "id" | "createdAt" | "updatedAt">>
  >,
) => {
  const queryClient = useQueryClient();

  return useMutation<
    Character,
    ApiError,
    { id: string } & Partial<Omit<Character, "id" | "createdAt" | "updatedAt">>
  >(updateCharacter, {
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.character(data.id), data);
    },
    ...options,
  });
};

// Delete character
const deleteCharacter = (id: string) =>
  mutateData<void>({ url: `/character/${id}`, method: "DELETE" });

export const useDeleteCharacter = (
  options?: UseMutationOptions<void, ApiError, string>,
) => {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>(deleteCharacter, {
    onSuccess: (_, id) => {
      queryClient.removeQueries(queryKeys.character(id));
      queryClient.invalidateQueries([queryKeys.characters]);
    },
    ...options,
  });
};

// Batch prefetch function for character creation flow
export const prefetchCharacterCreationData = async (
  queryClient: ReturnType<typeof useQueryClient>,
) => {
  await Promise.all([
    queryClient.prefetchQuery([queryKeys.species], fetchSpecies),
    queryClient.prefetchQuery([queryKeys.classes], fetchClasses),
    queryClient.prefetchQuery([queryKeys.backgrounds], fetchBackgrounds),
    queryClient.prefetchQuery(queryKeys.powers("force"), () =>
      fetchPowers("force"),
    ),
    queryClient.prefetchQuery(queryKeys.powers("tech"), () =>
      fetchPowers("tech"),
    ),
    queryClient.prefetchQuery(
      queryKeys.equipment({ page: 1, pageSize: 20 }),
      () => fetchEquipment({ page: 1, pageSize: 20 }),
    ),
    queryClient.prefetchQuery([queryKeys.feats], fetchFeats),
  ]);
};

// Export base API for custom requests
export { api };
