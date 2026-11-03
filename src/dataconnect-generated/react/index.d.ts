import { CreateOrganizationDataData, UpdateOrganizationData, UpdateOrganizationVariables, DeleteOrganizationData, DeleteOrganizationVariables, GetOrganizationData, GetOrganizationVariables, ListOrganizationsData, CreateUserData, UpdateUserRoleData, UpdateUserRoleVariables, DeleteUserData, GetCurrentUserData, ListOrganizationUsersData, ListOrganizationUsersVariables, CreateRepositoryData, CreateRepositoryVariables, UpdateRepositoryData, UpdateRepositoryVariables, DeleteRepositoryData, DeleteRepositoryVariables, GetRepositoryData, GetRepositoryVariables, ListRepositoriesData, CreateAnalysisData, CreateAnalysisVariables, UpdateAnalysisStatusData, UpdateAnalysisStatusVariables, DeleteAnalysisData, DeleteAnalysisVariables, GetAnalysisData, GetAnalysisVariables, ListAnalysesData, CreateVulnerabilityData, CreateVulnerabilityVariables, UpdateVulnerabilityData, UpdateVulnerabilityVariables, DeleteVulnerabilityData, DeleteVulnerabilityVariables, GetVulnerabilityData, GetVulnerabilityVariables, ListVulnerabilitiesData, CreatePolicyData, CreatePolicyVariables, UpdatePolicyData, UpdatePolicyVariables, DeletePolicyData, DeletePolicyVariables, GetPolicyData, GetPolicyVariables, ListPoliciesData } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useCreateOrganizationData(options?: useDataConnectMutationOptions<CreateOrganizationDataData, FirebaseError, void>): UseDataConnectMutationResult<CreateOrganizationDataData, undefined>;
export function useCreateOrganizationData(dc: DataConnect, options?: useDataConnectMutationOptions<CreateOrganizationDataData, FirebaseError, void>): UseDataConnectMutationResult<CreateOrganizationDataData, undefined>;

export function useUpdateOrganization(options?: useDataConnectMutationOptions<UpdateOrganizationData, FirebaseError, UpdateOrganizationVariables>): UseDataConnectMutationResult<UpdateOrganizationData, UpdateOrganizationVariables>;
export function useUpdateOrganization(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateOrganizationData, FirebaseError, UpdateOrganizationVariables>): UseDataConnectMutationResult<UpdateOrganizationData, UpdateOrganizationVariables>;

export function useDeleteOrganization(options?: useDataConnectMutationOptions<DeleteOrganizationData, FirebaseError, DeleteOrganizationVariables>): UseDataConnectMutationResult<DeleteOrganizationData, DeleteOrganizationVariables>;
export function useDeleteOrganization(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteOrganizationData, FirebaseError, DeleteOrganizationVariables>): UseDataConnectMutationResult<DeleteOrganizationData, DeleteOrganizationVariables>;

export function useGetOrganization(vars: GetOrganizationVariables, options?: useDataConnectQueryOptions<GetOrganizationData>): UseDataConnectQueryResult<GetOrganizationData, GetOrganizationVariables>;
export function useGetOrganization(dc: DataConnect, vars: GetOrganizationVariables, options?: useDataConnectQueryOptions<GetOrganizationData>): UseDataConnectQueryResult<GetOrganizationData, GetOrganizationVariables>;

export function useListOrganizations(options?: useDataConnectQueryOptions<ListOrganizationsData>): UseDataConnectQueryResult<ListOrganizationsData, undefined>;
export function useListOrganizations(dc: DataConnect, options?: useDataConnectQueryOptions<ListOrganizationsData>): UseDataConnectQueryResult<ListOrganizationsData, undefined>;

export function useCreateUser(options?: useDataConnectMutationOptions<CreateUserData, FirebaseError, void>): UseDataConnectMutationResult<CreateUserData, undefined>;
export function useCreateUser(dc: DataConnect, options?: useDataConnectMutationOptions<CreateUserData, FirebaseError, void>): UseDataConnectMutationResult<CreateUserData, undefined>;

export function useUpdateUserRole(options?: useDataConnectMutationOptions<UpdateUserRoleData, FirebaseError, UpdateUserRoleVariables>): UseDataConnectMutationResult<UpdateUserRoleData, UpdateUserRoleVariables>;
export function useUpdateUserRole(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateUserRoleData, FirebaseError, UpdateUserRoleVariables>): UseDataConnectMutationResult<UpdateUserRoleData, UpdateUserRoleVariables>;

export function useDeleteUser(options?: useDataConnectMutationOptions<DeleteUserData, FirebaseError, void>): UseDataConnectMutationResult<DeleteUserData, undefined>;
export function useDeleteUser(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteUserData, FirebaseError, void>): UseDataConnectMutationResult<DeleteUserData, undefined>;

export function useGetCurrentUser(options?: useDataConnectQueryOptions<GetCurrentUserData>): UseDataConnectQueryResult<GetCurrentUserData, undefined>;
export function useGetCurrentUser(dc: DataConnect, options?: useDataConnectQueryOptions<GetCurrentUserData>): UseDataConnectQueryResult<GetCurrentUserData, undefined>;

export function useListOrganizationUsers(vars: ListOrganizationUsersVariables, options?: useDataConnectQueryOptions<ListOrganizationUsersData>): UseDataConnectQueryResult<ListOrganizationUsersData, ListOrganizationUsersVariables>;
export function useListOrganizationUsers(dc: DataConnect, vars: ListOrganizationUsersVariables, options?: useDataConnectQueryOptions<ListOrganizationUsersData>): UseDataConnectQueryResult<ListOrganizationUsersData, ListOrganizationUsersVariables>;

export function useCreateRepository(options?: useDataConnectMutationOptions<CreateRepositoryData, FirebaseError, CreateRepositoryVariables>): UseDataConnectMutationResult<CreateRepositoryData, CreateRepositoryVariables>;
export function useCreateRepository(dc: DataConnect, options?: useDataConnectMutationOptions<CreateRepositoryData, FirebaseError, CreateRepositoryVariables>): UseDataConnectMutationResult<CreateRepositoryData, CreateRepositoryVariables>;

export function useUpdateRepository(options?: useDataConnectMutationOptions<UpdateRepositoryData, FirebaseError, UpdateRepositoryVariables>): UseDataConnectMutationResult<UpdateRepositoryData, UpdateRepositoryVariables>;
export function useUpdateRepository(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateRepositoryData, FirebaseError, UpdateRepositoryVariables>): UseDataConnectMutationResult<UpdateRepositoryData, UpdateRepositoryVariables>;

export function useDeleteRepository(options?: useDataConnectMutationOptions<DeleteRepositoryData, FirebaseError, DeleteRepositoryVariables>): UseDataConnectMutationResult<DeleteRepositoryData, DeleteRepositoryVariables>;
export function useDeleteRepository(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteRepositoryData, FirebaseError, DeleteRepositoryVariables>): UseDataConnectMutationResult<DeleteRepositoryData, DeleteRepositoryVariables>;

export function useGetRepository(vars: GetRepositoryVariables, options?: useDataConnectQueryOptions<GetRepositoryData>): UseDataConnectQueryResult<GetRepositoryData, GetRepositoryVariables>;
export function useGetRepository(dc: DataConnect, vars: GetRepositoryVariables, options?: useDataConnectQueryOptions<GetRepositoryData>): UseDataConnectQueryResult<GetRepositoryData, GetRepositoryVariables>;

export function useListRepositories(options?: useDataConnectQueryOptions<ListRepositoriesData>): UseDataConnectQueryResult<ListRepositoriesData, undefined>;
export function useListRepositories(dc: DataConnect, options?: useDataConnectQueryOptions<ListRepositoriesData>): UseDataConnectQueryResult<ListRepositoriesData, undefined>;

export function useCreateAnalysis(options?: useDataConnectMutationOptions<CreateAnalysisData, FirebaseError, CreateAnalysisVariables>): UseDataConnectMutationResult<CreateAnalysisData, CreateAnalysisVariables>;
export function useCreateAnalysis(dc: DataConnect, options?: useDataConnectMutationOptions<CreateAnalysisData, FirebaseError, CreateAnalysisVariables>): UseDataConnectMutationResult<CreateAnalysisData, CreateAnalysisVariables>;

export function useUpdateAnalysisStatus(options?: useDataConnectMutationOptions<UpdateAnalysisStatusData, FirebaseError, UpdateAnalysisStatusVariables>): UseDataConnectMutationResult<UpdateAnalysisStatusData, UpdateAnalysisStatusVariables>;
export function useUpdateAnalysisStatus(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateAnalysisStatusData, FirebaseError, UpdateAnalysisStatusVariables>): UseDataConnectMutationResult<UpdateAnalysisStatusData, UpdateAnalysisStatusVariables>;

export function useDeleteAnalysis(options?: useDataConnectMutationOptions<DeleteAnalysisData, FirebaseError, DeleteAnalysisVariables>): UseDataConnectMutationResult<DeleteAnalysisData, DeleteAnalysisVariables>;
export function useDeleteAnalysis(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteAnalysisData, FirebaseError, DeleteAnalysisVariables>): UseDataConnectMutationResult<DeleteAnalysisData, DeleteAnalysisVariables>;

export function useGetAnalysis(vars: GetAnalysisVariables, options?: useDataConnectQueryOptions<GetAnalysisData>): UseDataConnectQueryResult<GetAnalysisData, GetAnalysisVariables>;
export function useGetAnalysis(dc: DataConnect, vars: GetAnalysisVariables, options?: useDataConnectQueryOptions<GetAnalysisData>): UseDataConnectQueryResult<GetAnalysisData, GetAnalysisVariables>;

export function useListAnalyses(options?: useDataConnectQueryOptions<ListAnalysesData>): UseDataConnectQueryResult<ListAnalysesData, undefined>;
export function useListAnalyses(dc: DataConnect, options?: useDataConnectQueryOptions<ListAnalysesData>): UseDataConnectQueryResult<ListAnalysesData, undefined>;

export function useCreateVulnerability(options?: useDataConnectMutationOptions<CreateVulnerabilityData, FirebaseError, CreateVulnerabilityVariables>): UseDataConnectMutationResult<CreateVulnerabilityData, CreateVulnerabilityVariables>;
export function useCreateVulnerability(dc: DataConnect, options?: useDataConnectMutationOptions<CreateVulnerabilityData, FirebaseError, CreateVulnerabilityVariables>): UseDataConnectMutationResult<CreateVulnerabilityData, CreateVulnerabilityVariables>;

export function useUpdateVulnerability(options?: useDataConnectMutationOptions<UpdateVulnerabilityData, FirebaseError, UpdateVulnerabilityVariables>): UseDataConnectMutationResult<UpdateVulnerabilityData, UpdateVulnerabilityVariables>;
export function useUpdateVulnerability(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateVulnerabilityData, FirebaseError, UpdateVulnerabilityVariables>): UseDataConnectMutationResult<UpdateVulnerabilityData, UpdateVulnerabilityVariables>;

export function useDeleteVulnerability(options?: useDataConnectMutationOptions<DeleteVulnerabilityData, FirebaseError, DeleteVulnerabilityVariables>): UseDataConnectMutationResult<DeleteVulnerabilityData, DeleteVulnerabilityVariables>;
export function useDeleteVulnerability(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteVulnerabilityData, FirebaseError, DeleteVulnerabilityVariables>): UseDataConnectMutationResult<DeleteVulnerabilityData, DeleteVulnerabilityVariables>;

export function useGetVulnerability(vars: GetVulnerabilityVariables, options?: useDataConnectQueryOptions<GetVulnerabilityData>): UseDataConnectQueryResult<GetVulnerabilityData, GetVulnerabilityVariables>;
export function useGetVulnerability(dc: DataConnect, vars: GetVulnerabilityVariables, options?: useDataConnectQueryOptions<GetVulnerabilityData>): UseDataConnectQueryResult<GetVulnerabilityData, GetVulnerabilityVariables>;

export function useListVulnerabilities(options?: useDataConnectQueryOptions<ListVulnerabilitiesData>): UseDataConnectQueryResult<ListVulnerabilitiesData, undefined>;
export function useListVulnerabilities(dc: DataConnect, options?: useDataConnectQueryOptions<ListVulnerabilitiesData>): UseDataConnectQueryResult<ListVulnerabilitiesData, undefined>;

export function useCreatePolicy(options?: useDataConnectMutationOptions<CreatePolicyData, FirebaseError, CreatePolicyVariables>): UseDataConnectMutationResult<CreatePolicyData, CreatePolicyVariables>;
export function useCreatePolicy(dc: DataConnect, options?: useDataConnectMutationOptions<CreatePolicyData, FirebaseError, CreatePolicyVariables>): UseDataConnectMutationResult<CreatePolicyData, CreatePolicyVariables>;

export function useUpdatePolicy(options?: useDataConnectMutationOptions<UpdatePolicyData, FirebaseError, UpdatePolicyVariables>): UseDataConnectMutationResult<UpdatePolicyData, UpdatePolicyVariables>;
export function useUpdatePolicy(dc: DataConnect, options?: useDataConnectMutationOptions<UpdatePolicyData, FirebaseError, UpdatePolicyVariables>): UseDataConnectMutationResult<UpdatePolicyData, UpdatePolicyVariables>;

export function useDeletePolicy(options?: useDataConnectMutationOptions<DeletePolicyData, FirebaseError, DeletePolicyVariables>): UseDataConnectMutationResult<DeletePolicyData, DeletePolicyVariables>;
export function useDeletePolicy(dc: DataConnect, options?: useDataConnectMutationOptions<DeletePolicyData, FirebaseError, DeletePolicyVariables>): UseDataConnectMutationResult<DeletePolicyData, DeletePolicyVariables>;

export function useGetPolicy(vars: GetPolicyVariables, options?: useDataConnectQueryOptions<GetPolicyData>): UseDataConnectQueryResult<GetPolicyData, GetPolicyVariables>;
export function useGetPolicy(dc: DataConnect, vars: GetPolicyVariables, options?: useDataConnectQueryOptions<GetPolicyData>): UseDataConnectQueryResult<GetPolicyData, GetPolicyVariables>;

export function useListPolicies(options?: useDataConnectQueryOptions<ListPoliciesData>): UseDataConnectQueryResult<ListPoliciesData, undefined>;
export function useListPolicies(dc: DataConnect, options?: useDataConnectQueryOptions<ListPoliciesData>): UseDataConnectQueryResult<ListPoliciesData, undefined>;
