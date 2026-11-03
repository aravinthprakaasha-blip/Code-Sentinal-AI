import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, MutationRef, MutationPromise, DataConnectSettings } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;
export const dataConnectSettings: DataConnectSettings;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface Analysis_Key {
  id: UUIDString;
  __typename?: 'Analysis_Key';
}

export interface CreateAnalysisData {
  analysis_insert: Analysis_Key;
}

export interface CreateAnalysisVariables {
  repo: Repository_Key;
  hash: string;
}

export interface CreateOrganizationDataData {
  organization_insert: Organization_Key;
}

export interface CreatePolicyData {
  policy_insert: Policy_Key;
}

export interface CreatePolicyVariables {
  org: Organization_Key;
  name: string;
  ruleSet: string;
}

export interface CreateRepositoryData {
  repository_insert: Repository_Key;
}

export interface CreateRepositoryVariables {
  name: string;
  url: string;
  org: Organization_Key;
}

export interface CreateUserData {
  user_insert: User_Key;
}

export interface CreateVulnerabilityData {
  vulnerability_insert: Vulnerability_Key;
}

export interface CreateVulnerabilityVariables {
  analysis: Analysis_Key;
  desc: string;
  sev: string;
}

export interface DeleteAnalysisData {
  analysis_delete?: Analysis_Key | null;
}

export interface DeleteAnalysisVariables {
  id: UUIDString;
}

export interface DeleteOrganizationData {
  organization_delete?: Organization_Key | null;
}

export interface DeleteOrganizationVariables {
  id: UUIDString;
}

export interface DeletePolicyData {
  policy_delete?: Policy_Key | null;
}

export interface DeletePolicyVariables {
  id: UUIDString;
}

export interface DeleteRepositoryData {
  repository_delete?: Repository_Key | null;
}

export interface DeleteRepositoryVariables {
  id: UUIDString;
}

export interface DeleteUserData {
  user_delete?: User_Key | null;
}

export interface DeleteVulnerabilityData {
  vulnerability_delete?: Vulnerability_Key | null;
}

export interface DeleteVulnerabilityVariables {
  id: UUIDString;
}

export interface GetAnalysisData {
  analysis?: {
    status: string;
    commitHash?: string | null;
  };
}

export interface GetAnalysisVariables {
  id: UUIDString;
}

export interface GetCurrentUserData {
  user?: {
    email: string;
    role: string;
  };
}

export interface GetOrganizationData {
  organization?: {
    name: string;
    subscriptionTier?: string | null;
  };
}

export interface GetOrganizationVariables {
  id: UUIDString;
}

export interface GetPolicyData {
  policy?: {
    name: string;
    ruleSet: string;
  };
}

export interface GetPolicyVariables {
  id: UUIDString;
}

export interface GetRepositoryData {
  repository?: {
    name: string;
    remoteUrl: string;
  };
}

export interface GetRepositoryVariables {
  id: UUIDString;
}

export interface GetVulnerabilityData {
  vulnerability?: {
    severity: string;
    description: string;
  };
}

export interface GetVulnerabilityVariables {
  id: UUIDString;
}

export interface ListAnalysesData {
  analyses: ({
    status: string;
    scanDate: TimestampString;
  })[];
}

export interface ListOrganizationUsersData {
  users: ({
    email: string;
    role: string;
  })[];
}

export interface ListOrganizationUsersVariables {
  orgId: UUIDString;
}

export interface ListOrganizationsData {
  organizations: ({
    id: UUIDString;
    name: string;
  } & Organization_Key)[];
}

export interface ListPoliciesData {
  policies: ({
    name: string;
  })[];
}

export interface ListRepositoriesData {
  repositories: ({
    name: string;
  })[];
}

export interface ListVulnerabilitiesData {
  vulnerabilities: ({
    type: string;
    severity: string;
  })[];
}

export interface Organization_Key {
  id: UUIDString;
  __typename?: 'Organization_Key';
}

export interface Policy_Key {
  id: UUIDString;
  __typename?: 'Policy_Key';
}

export interface Repository_Key {
  id: UUIDString;
  __typename?: 'Repository_Key';
}

export interface UpdateAnalysisStatusData {
  analysis_update?: Analysis_Key | null;
}

export interface UpdateAnalysisStatusVariables {
  id: UUIDString;
  status: string;
}

export interface UpdateOrganizationData {
  organization_update?: Organization_Key | null;
}

export interface UpdateOrganizationVariables {
  id: UUIDString;
  tier: string;
}

export interface UpdatePolicyData {
  policy_update?: Policy_Key | null;
}

export interface UpdatePolicyVariables {
  id: UUIDString;
  level: string;
}

export interface UpdateRepositoryData {
  repository_update?: Repository_Key | null;
}

export interface UpdateRepositoryVariables {
  id: UUIDString;
  name: string;
}

export interface UpdateUserRoleData {
  user_update?: User_Key | null;
}

export interface UpdateUserRoleVariables {
  role: string;
}

export interface UpdateVulnerabilityData {
  vulnerability_update?: Vulnerability_Key | null;
}

export interface UpdateVulnerabilityVariables {
  id: UUIDString;
  status: string;
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

export interface Vulnerability_Key {
  id: UUIDString;
  __typename?: 'Vulnerability_Key';
}

interface CreateOrganizationDataRef {
  /* Allow users to create refs without passing in DataConnect */
  (): MutationRef<CreateOrganizationDataData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): MutationRef<CreateOrganizationDataData, undefined>;
  operationName: string;
}
export const createOrganizationDataRef: CreateOrganizationDataRef;

export function createOrganizationData(): MutationPromise<CreateOrganizationDataData, undefined>;
export function createOrganizationData(dc: DataConnect): MutationPromise<CreateOrganizationDataData, undefined>;

interface UpdateOrganizationRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateOrganizationVariables): MutationRef<UpdateOrganizationData, UpdateOrganizationVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateOrganizationVariables): MutationRef<UpdateOrganizationData, UpdateOrganizationVariables>;
  operationName: string;
}
export const updateOrganizationRef: UpdateOrganizationRef;

export function updateOrganization(vars: UpdateOrganizationVariables): MutationPromise<UpdateOrganizationData, UpdateOrganizationVariables>;
export function updateOrganization(dc: DataConnect, vars: UpdateOrganizationVariables): MutationPromise<UpdateOrganizationData, UpdateOrganizationVariables>;

interface DeleteOrganizationRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteOrganizationVariables): MutationRef<DeleteOrganizationData, DeleteOrganizationVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteOrganizationVariables): MutationRef<DeleteOrganizationData, DeleteOrganizationVariables>;
  operationName: string;
}
export const deleteOrganizationRef: DeleteOrganizationRef;

export function deleteOrganization(vars: DeleteOrganizationVariables): MutationPromise<DeleteOrganizationData, DeleteOrganizationVariables>;
export function deleteOrganization(dc: DataConnect, vars: DeleteOrganizationVariables): MutationPromise<DeleteOrganizationData, DeleteOrganizationVariables>;

interface GetOrganizationRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetOrganizationVariables): QueryRef<GetOrganizationData, GetOrganizationVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetOrganizationVariables): QueryRef<GetOrganizationData, GetOrganizationVariables>;
  operationName: string;
}
export const getOrganizationRef: GetOrganizationRef;

export function getOrganization(vars: GetOrganizationVariables, options?: ExecuteQueryOptions): QueryPromise<GetOrganizationData, GetOrganizationVariables>;
export function getOrganization(dc: DataConnect, vars: GetOrganizationVariables, options?: ExecuteQueryOptions): QueryPromise<GetOrganizationData, GetOrganizationVariables>;

interface ListOrganizationsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListOrganizationsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListOrganizationsData, undefined>;
  operationName: string;
}
export const listOrganizationsRef: ListOrganizationsRef;

export function listOrganizations(options?: ExecuteQueryOptions): QueryPromise<ListOrganizationsData, undefined>;
export function listOrganizations(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListOrganizationsData, undefined>;

interface CreateUserRef {
  /* Allow users to create refs without passing in DataConnect */
  (): MutationRef<CreateUserData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): MutationRef<CreateUserData, undefined>;
  operationName: string;
}
export const createUserRef: CreateUserRef;

export function createUser(): MutationPromise<CreateUserData, undefined>;
export function createUser(dc: DataConnect): MutationPromise<CreateUserData, undefined>;

interface UpdateUserRoleRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateUserRoleVariables): MutationRef<UpdateUserRoleData, UpdateUserRoleVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateUserRoleVariables): MutationRef<UpdateUserRoleData, UpdateUserRoleVariables>;
  operationName: string;
}
export const updateUserRoleRef: UpdateUserRoleRef;

export function updateUserRole(vars: UpdateUserRoleVariables): MutationPromise<UpdateUserRoleData, UpdateUserRoleVariables>;
export function updateUserRole(dc: DataConnect, vars: UpdateUserRoleVariables): MutationPromise<UpdateUserRoleData, UpdateUserRoleVariables>;

interface DeleteUserRef {
  /* Allow users to create refs without passing in DataConnect */
  (): MutationRef<DeleteUserData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): MutationRef<DeleteUserData, undefined>;
  operationName: string;
}
export const deleteUserRef: DeleteUserRef;

export function deleteUser(): MutationPromise<DeleteUserData, undefined>;
export function deleteUser(dc: DataConnect): MutationPromise<DeleteUserData, undefined>;

interface GetCurrentUserRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetCurrentUserData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetCurrentUserData, undefined>;
  operationName: string;
}
export const getCurrentUserRef: GetCurrentUserRef;

export function getCurrentUser(options?: ExecuteQueryOptions): QueryPromise<GetCurrentUserData, undefined>;
export function getCurrentUser(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetCurrentUserData, undefined>;

interface ListOrganizationUsersRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: ListOrganizationUsersVariables): QueryRef<ListOrganizationUsersData, ListOrganizationUsersVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: ListOrganizationUsersVariables): QueryRef<ListOrganizationUsersData, ListOrganizationUsersVariables>;
  operationName: string;
}
export const listOrganizationUsersRef: ListOrganizationUsersRef;

export function listOrganizationUsers(vars: ListOrganizationUsersVariables, options?: ExecuteQueryOptions): QueryPromise<ListOrganizationUsersData, ListOrganizationUsersVariables>;
export function listOrganizationUsers(dc: DataConnect, vars: ListOrganizationUsersVariables, options?: ExecuteQueryOptions): QueryPromise<ListOrganizationUsersData, ListOrganizationUsersVariables>;

interface CreateRepositoryRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateRepositoryVariables): MutationRef<CreateRepositoryData, CreateRepositoryVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateRepositoryVariables): MutationRef<CreateRepositoryData, CreateRepositoryVariables>;
  operationName: string;
}
export const createRepositoryRef: CreateRepositoryRef;

export function createRepository(vars: CreateRepositoryVariables): MutationPromise<CreateRepositoryData, CreateRepositoryVariables>;
export function createRepository(dc: DataConnect, vars: CreateRepositoryVariables): MutationPromise<CreateRepositoryData, CreateRepositoryVariables>;

interface UpdateRepositoryRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateRepositoryVariables): MutationRef<UpdateRepositoryData, UpdateRepositoryVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateRepositoryVariables): MutationRef<UpdateRepositoryData, UpdateRepositoryVariables>;
  operationName: string;
}
export const updateRepositoryRef: UpdateRepositoryRef;

export function updateRepository(vars: UpdateRepositoryVariables): MutationPromise<UpdateRepositoryData, UpdateRepositoryVariables>;
export function updateRepository(dc: DataConnect, vars: UpdateRepositoryVariables): MutationPromise<UpdateRepositoryData, UpdateRepositoryVariables>;

interface DeleteRepositoryRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteRepositoryVariables): MutationRef<DeleteRepositoryData, DeleteRepositoryVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteRepositoryVariables): MutationRef<DeleteRepositoryData, DeleteRepositoryVariables>;
  operationName: string;
}
export const deleteRepositoryRef: DeleteRepositoryRef;

export function deleteRepository(vars: DeleteRepositoryVariables): MutationPromise<DeleteRepositoryData, DeleteRepositoryVariables>;
export function deleteRepository(dc: DataConnect, vars: DeleteRepositoryVariables): MutationPromise<DeleteRepositoryData, DeleteRepositoryVariables>;

interface GetRepositoryRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetRepositoryVariables): QueryRef<GetRepositoryData, GetRepositoryVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetRepositoryVariables): QueryRef<GetRepositoryData, GetRepositoryVariables>;
  operationName: string;
}
export const getRepositoryRef: GetRepositoryRef;

export function getRepository(vars: GetRepositoryVariables, options?: ExecuteQueryOptions): QueryPromise<GetRepositoryData, GetRepositoryVariables>;
export function getRepository(dc: DataConnect, vars: GetRepositoryVariables, options?: ExecuteQueryOptions): QueryPromise<GetRepositoryData, GetRepositoryVariables>;

interface ListRepositoriesRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListRepositoriesData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListRepositoriesData, undefined>;
  operationName: string;
}
export const listRepositoriesRef: ListRepositoriesRef;

export function listRepositories(options?: ExecuteQueryOptions): QueryPromise<ListRepositoriesData, undefined>;
export function listRepositories(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListRepositoriesData, undefined>;

interface CreateAnalysisRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateAnalysisVariables): MutationRef<CreateAnalysisData, CreateAnalysisVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateAnalysisVariables): MutationRef<CreateAnalysisData, CreateAnalysisVariables>;
  operationName: string;
}
export const createAnalysisRef: CreateAnalysisRef;

export function createAnalysis(vars: CreateAnalysisVariables): MutationPromise<CreateAnalysisData, CreateAnalysisVariables>;
export function createAnalysis(dc: DataConnect, vars: CreateAnalysisVariables): MutationPromise<CreateAnalysisData, CreateAnalysisVariables>;

interface UpdateAnalysisStatusRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateAnalysisStatusVariables): MutationRef<UpdateAnalysisStatusData, UpdateAnalysisStatusVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateAnalysisStatusVariables): MutationRef<UpdateAnalysisStatusData, UpdateAnalysisStatusVariables>;
  operationName: string;
}
export const updateAnalysisStatusRef: UpdateAnalysisStatusRef;

export function updateAnalysisStatus(vars: UpdateAnalysisStatusVariables): MutationPromise<UpdateAnalysisStatusData, UpdateAnalysisStatusVariables>;
export function updateAnalysisStatus(dc: DataConnect, vars: UpdateAnalysisStatusVariables): MutationPromise<UpdateAnalysisStatusData, UpdateAnalysisStatusVariables>;

interface DeleteAnalysisRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteAnalysisVariables): MutationRef<DeleteAnalysisData, DeleteAnalysisVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteAnalysisVariables): MutationRef<DeleteAnalysisData, DeleteAnalysisVariables>;
  operationName: string;
}
export const deleteAnalysisRef: DeleteAnalysisRef;

export function deleteAnalysis(vars: DeleteAnalysisVariables): MutationPromise<DeleteAnalysisData, DeleteAnalysisVariables>;
export function deleteAnalysis(dc: DataConnect, vars: DeleteAnalysisVariables): MutationPromise<DeleteAnalysisData, DeleteAnalysisVariables>;

interface GetAnalysisRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetAnalysisVariables): QueryRef<GetAnalysisData, GetAnalysisVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetAnalysisVariables): QueryRef<GetAnalysisData, GetAnalysisVariables>;
  operationName: string;
}
export const getAnalysisRef: GetAnalysisRef;

export function getAnalysis(vars: GetAnalysisVariables, options?: ExecuteQueryOptions): QueryPromise<GetAnalysisData, GetAnalysisVariables>;
export function getAnalysis(dc: DataConnect, vars: GetAnalysisVariables, options?: ExecuteQueryOptions): QueryPromise<GetAnalysisData, GetAnalysisVariables>;

interface ListAnalysesRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListAnalysesData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListAnalysesData, undefined>;
  operationName: string;
}
export const listAnalysesRef: ListAnalysesRef;

export function listAnalyses(options?: ExecuteQueryOptions): QueryPromise<ListAnalysesData, undefined>;
export function listAnalyses(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListAnalysesData, undefined>;

interface CreateVulnerabilityRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateVulnerabilityVariables): MutationRef<CreateVulnerabilityData, CreateVulnerabilityVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateVulnerabilityVariables): MutationRef<CreateVulnerabilityData, CreateVulnerabilityVariables>;
  operationName: string;
}
export const createVulnerabilityRef: CreateVulnerabilityRef;

export function createVulnerability(vars: CreateVulnerabilityVariables): MutationPromise<CreateVulnerabilityData, CreateVulnerabilityVariables>;
export function createVulnerability(dc: DataConnect, vars: CreateVulnerabilityVariables): MutationPromise<CreateVulnerabilityData, CreateVulnerabilityVariables>;

interface UpdateVulnerabilityRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateVulnerabilityVariables): MutationRef<UpdateVulnerabilityData, UpdateVulnerabilityVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateVulnerabilityVariables): MutationRef<UpdateVulnerabilityData, UpdateVulnerabilityVariables>;
  operationName: string;
}
export const updateVulnerabilityRef: UpdateVulnerabilityRef;

export function updateVulnerability(vars: UpdateVulnerabilityVariables): MutationPromise<UpdateVulnerabilityData, UpdateVulnerabilityVariables>;
export function updateVulnerability(dc: DataConnect, vars: UpdateVulnerabilityVariables): MutationPromise<UpdateVulnerabilityData, UpdateVulnerabilityVariables>;

interface DeleteVulnerabilityRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteVulnerabilityVariables): MutationRef<DeleteVulnerabilityData, DeleteVulnerabilityVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteVulnerabilityVariables): MutationRef<DeleteVulnerabilityData, DeleteVulnerabilityVariables>;
  operationName: string;
}
export const deleteVulnerabilityRef: DeleteVulnerabilityRef;

export function deleteVulnerability(vars: DeleteVulnerabilityVariables): MutationPromise<DeleteVulnerabilityData, DeleteVulnerabilityVariables>;
export function deleteVulnerability(dc: DataConnect, vars: DeleteVulnerabilityVariables): MutationPromise<DeleteVulnerabilityData, DeleteVulnerabilityVariables>;

interface GetVulnerabilityRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetVulnerabilityVariables): QueryRef<GetVulnerabilityData, GetVulnerabilityVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetVulnerabilityVariables): QueryRef<GetVulnerabilityData, GetVulnerabilityVariables>;
  operationName: string;
}
export const getVulnerabilityRef: GetVulnerabilityRef;

export function getVulnerability(vars: GetVulnerabilityVariables, options?: ExecuteQueryOptions): QueryPromise<GetVulnerabilityData, GetVulnerabilityVariables>;
export function getVulnerability(dc: DataConnect, vars: GetVulnerabilityVariables, options?: ExecuteQueryOptions): QueryPromise<GetVulnerabilityData, GetVulnerabilityVariables>;

interface ListVulnerabilitiesRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListVulnerabilitiesData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListVulnerabilitiesData, undefined>;
  operationName: string;
}
export const listVulnerabilitiesRef: ListVulnerabilitiesRef;

export function listVulnerabilities(options?: ExecuteQueryOptions): QueryPromise<ListVulnerabilitiesData, undefined>;
export function listVulnerabilities(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListVulnerabilitiesData, undefined>;

interface CreatePolicyRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreatePolicyVariables): MutationRef<CreatePolicyData, CreatePolicyVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreatePolicyVariables): MutationRef<CreatePolicyData, CreatePolicyVariables>;
  operationName: string;
}
export const createPolicyRef: CreatePolicyRef;

export function createPolicy(vars: CreatePolicyVariables): MutationPromise<CreatePolicyData, CreatePolicyVariables>;
export function createPolicy(dc: DataConnect, vars: CreatePolicyVariables): MutationPromise<CreatePolicyData, CreatePolicyVariables>;

interface UpdatePolicyRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdatePolicyVariables): MutationRef<UpdatePolicyData, UpdatePolicyVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdatePolicyVariables): MutationRef<UpdatePolicyData, UpdatePolicyVariables>;
  operationName: string;
}
export const updatePolicyRef: UpdatePolicyRef;

export function updatePolicy(vars: UpdatePolicyVariables): MutationPromise<UpdatePolicyData, UpdatePolicyVariables>;
export function updatePolicy(dc: DataConnect, vars: UpdatePolicyVariables): MutationPromise<UpdatePolicyData, UpdatePolicyVariables>;

interface DeletePolicyRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeletePolicyVariables): MutationRef<DeletePolicyData, DeletePolicyVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeletePolicyVariables): MutationRef<DeletePolicyData, DeletePolicyVariables>;
  operationName: string;
}
export const deletePolicyRef: DeletePolicyRef;

export function deletePolicy(vars: DeletePolicyVariables): MutationPromise<DeletePolicyData, DeletePolicyVariables>;
export function deletePolicy(dc: DataConnect, vars: DeletePolicyVariables): MutationPromise<DeletePolicyData, DeletePolicyVariables>;

interface GetPolicyRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetPolicyVariables): QueryRef<GetPolicyData, GetPolicyVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetPolicyVariables): QueryRef<GetPolicyData, GetPolicyVariables>;
  operationName: string;
}
export const getPolicyRef: GetPolicyRef;

export function getPolicy(vars: GetPolicyVariables, options?: ExecuteQueryOptions): QueryPromise<GetPolicyData, GetPolicyVariables>;
export function getPolicy(dc: DataConnect, vars: GetPolicyVariables, options?: ExecuteQueryOptions): QueryPromise<GetPolicyData, GetPolicyVariables>;

interface ListPoliciesRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListPoliciesData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListPoliciesData, undefined>;
  operationName: string;
}
export const listPoliciesRef: ListPoliciesRef;

export function listPolicies(options?: ExecuteQueryOptions): QueryPromise<ListPoliciesData, undefined>;
export function listPolicies(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListPoliciesData, undefined>;

