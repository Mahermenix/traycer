import { defineRpcContract } from "@traycer/protocol/framework/index";
import {
  providersMcpAuthRequestSchema,
  providersMcpAuthResponseSchema,
  providersMcpDiscoverRequestSchema,
  providersMcpDiscoverResponseSchema,
  providersMcpListRequestSchema,
  providersMcpListResponseSchema,
  providersMcpMutateRequestSchema,
  providersMcpMutateResponseSchema,
  providersPluginsListRequestSchema,
  providersPluginsListResponseSchema,
  providersPluginsMutateRequestSchema,
  providersPluginsMutateResponseSchema,
  providersSkillsListRequestSchema,
  providersSkillsListResponseSchema,
  providersSkillsMutateRequestSchema,
  providersSkillsMutateResponseSchema,
} from "./provider-native-schemas";

export const providersMcpListV10 = defineRpcContract({
  method: "providers.mcpList",
  schemaVersion: { major: 1, minor: 0 } as const,
  requestSchema: providersMcpListRequestSchema,
  responseSchema: providersMcpListResponseSchema,
});

export const providersMcpMutateV10 = defineRpcContract({
  method: "providers.mcpMutate",
  schemaVersion: { major: 1, minor: 0 } as const,
  requestSchema: providersMcpMutateRequestSchema,
  responseSchema: providersMcpMutateResponseSchema,
});

export const providersMcpDiscoverV10 = defineRpcContract({
  method: "providers.mcpDiscover",
  schemaVersion: { major: 1, minor: 0 } as const,
  requestSchema: providersMcpDiscoverRequestSchema,
  responseSchema: providersMcpDiscoverResponseSchema,
});

export const providersMcpAuthV10 = defineRpcContract({
  method: "providers.mcpAuth",
  schemaVersion: { major: 1, minor: 0 } as const,
  requestSchema: providersMcpAuthRequestSchema,
  responseSchema: providersMcpAuthResponseSchema,
});

export const providersPluginsListV10 = defineRpcContract({
  method: "providers.pluginsList",
  schemaVersion: { major: 1, minor: 0 } as const,
  requestSchema: providersPluginsListRequestSchema,
  responseSchema: providersPluginsListResponseSchema,
});

export const providersPluginsMutateV10 = defineRpcContract({
  method: "providers.pluginsMutate",
  schemaVersion: { major: 1, minor: 0 } as const,
  requestSchema: providersPluginsMutateRequestSchema,
  responseSchema: providersPluginsMutateResponseSchema,
});

export const providersSkillsListV10 = defineRpcContract({
  method: "providers.skillsList",
  schemaVersion: { major: 1, minor: 0 } as const,
  requestSchema: providersSkillsListRequestSchema,
  responseSchema: providersSkillsListResponseSchema,
});

export const providersSkillsMutateV10 = defineRpcContract({
  method: "providers.skillsMutate",
  schemaVersion: { major: 1, minor: 0 } as const,
  requestSchema: providersSkillsMutateRequestSchema,
  responseSchema: providersSkillsMutateResponseSchema,
});
