-- CreateEnum
CREATE TYPE "AustralianState" AS ENUM ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('Draft', 'Onboarding', 'Active', 'Suspended', 'Terminating', 'Terminated', 'Cancelled');

-- CreateEnum
CREATE TYPE "FacilityStatus" AS ENUM ('Onboarding', 'Active', 'Suspended', 'Closed');

-- CreateEnum
CREATE TYPE "AuthAudience" AS ENUM ('SUPER_ADMIN', 'PORTAL');

-- CreateEnum
CREATE TYPE "SuperAdminUserStatus" AS ENUM ('Active', 'Disabled');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('Invited', 'Onboarding', 'Active', 'Suspended', 'Deactivated');

-- CreateEnum
CREATE TYPE "NurseAppRole" AS ENUM ('PCW', 'EN', 'RN', 'OtherStaff');

-- CreateEnum
CREATE TYPE "RegistrationType" AS ENUM ('RN', 'EN', 'None');

-- CreateEnum
CREATE TYPE "PortalRole" AS ENUM ('Owner', 'ProviderAdmin', 'FacilityManager', 'ClinicalLead', 'CareManager');

-- CreateEnum
CREATE TYPE "ResidentStatus" AS ENUM ('PreAdmission', 'Admitted', 'OnLeave', 'InHospital', 'Departed', 'Deceased');

-- CreateEnum
CREATE TYPE "AiDocumentationConsent" AS ENUM ('Pending', 'Informed', 'Consented', 'OptedOut');

-- CreateEnum
CREATE TYPE "ContactRoleType" AS ENUM ('RegisteredSupporter', 'SubstituteDecisionMaker', 'FamilyContact');

-- CreateEnum
CREATE TYPE "LocationEventKind" AS ENUM ('Admission', 'RoomChange', 'Transfer');

-- CreateEnum
CREATE TYPE "RoomChangeReason" AS ENUM ('ResidentRequest', 'ResidentAgreed', 'AssessedClinicalReason', 'Maintenance', 'Emergency');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('Blocked', 'AwaitingAcceptance', 'Completed', 'Cancelled');

-- CreateEnum
CREATE TYPE "TransferReasonCategory" AS ENUM ('CareNeeds', 'ResidentOrFamilyRequest', 'FacilityCapacity', 'Other');

-- CreateEnum
CREATE TYPE "RosterBatchStatus" AS ENUM ('AwaitingDecisions', 'BlockedByConflicts', 'AwaitingSecondConfirmation', 'Applied', 'Reverted', 'Discarded');

-- CreateEnum
CREATE TYPE "RosterRowStatus" AS ENUM ('New', 'Update', 'PossibleMatch', 'Conflict', 'Missing', 'NearName');

-- CreateEnum
CREATE TYPE "RosterRowDecision" AS ENUM ('Undecided', 'Accept', 'SamePerson', 'DifferentPerson', 'Skip');

-- CreateEnum
CREATE TYPE "ConfigLayer" AS ENUM ('Platform', 'Provider', 'Facility');

-- CreateEnum
CREATE TYPE "ConfigVersionStatus" AS ENUM ('PendingApproval', 'Scheduled', 'Effective', 'Superseded', 'Rejected');

-- CreateEnum
CREATE TYPE "EffectiveMode" AS ENUM ('NextShift', 'Immediate');

-- CreateEnum
CREATE TYPE "WorkflowItem" AS ENUM ('ReviewChain', 'EscalationRouting', 'LifecycleChecklist', 'StaffOnboarding', 'FacilityGoLive');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('Draft', 'PendingApproval', 'Published', 'Deprecated', 'Planned');

-- CreateEnum
CREATE TYPE "FeatureFlagCategory" AS ENUM ('Release', 'Risk', 'Operations');

-- CreateEnum
CREATE TYPE "FeatureFlagScope" AS ENUM ('Global', 'State', 'Provider', 'Facility');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('NotInvoiced', 'Invoiced', 'Paid', 'Overdue');

-- CreateEnum
CREATE TYPE "ComplianceDocumentType" AS ENUM ('PilotAgreement', 'SuccessCriteria', 'Msa', 'Dpa', 'CarekindPia', 'ProviderPia', 'InsuranceProfessionalIndemnity', 'InsuranceCyber', 'InsurancePublicLiability', 'SecurityQuestionnaire', 'SubprocessorList', 'ClinicalSafetyPack');

-- CreateEnum
CREATE TYPE "ComplianceStatusValue" AS ENUM ('NotStarted', 'Drafting', 'Sent', 'Signed', 'Expired', 'NotApplicable');

-- CreateEnum
CREATE TYPE "BreachRegime" AS ENUM ('CommonwealthNdb', 'NswPublicSector', 'QldPublicSector', 'VicOvic', 'Other');

-- CreateEnum
CREATE TYPE "GoLiveItemSource" AS ENUM ('ContractStatus', 'ProviderSelfReport', 'ProviderPortal', 'SuperAdmin');

-- CreateEnum
CREATE TYPE "SupportAccessScope" AS ENUM ('Metadata', 'SingleRecordOrExportJob', 'UnitShiftRecordList');

-- CreateEnum
CREATE TYPE "SupportAccessStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Active', 'Expired', 'Revoked');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('ProviderActivate', 'ProviderSuspend', 'ProviderResume', 'ProviderTerminate', 'FacilityStateChange', 'RulePackPublish', 'TemplatePublish', 'PlatformConfigPublish', 'FeatureFlagGlobalEnable');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Withdrawn');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('SuperAdminUser', 'ProviderStaff', 'SupportSession', 'System');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('Succeeded', 'Rejected');

-- CreateTable
CREATE TABLE "super_admin_user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "SuperAdminUserStatus" NOT NULL DEFAULT 'Active',
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "super_admin_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_group" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admin_group_membership" (
    "userId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" UUID,

    CONSTRAINT "super_admin_group_membership_pkey" PRIMARY KEY ("userId","groupId")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "audience" "AuthAudience" NOT NULL,
    "subjectId" UUID NOT NULL,
    "providerId" UUID,
    "familyId" UUID NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "refreshTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_request" (
    "id" UUID NOT NULL,
    "providerId" UUID,
    "kind" "ApprovalKind" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'Pending',
    "requestedBy" UUID NOT NULL,
    "decidedBy" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_rule_pack" (
    "id" TEXT NOT NULL,
    "state" "AustralianState" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'Draft',
    "entries" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "draftedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "state_rule_pack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_template_version" (
    "id" UUID NOT NULL,
    "templateName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sourceCommit" TEXT,
    "defaultTier" INTEGER NOT NULL,
    "humanOnlyFields" TEXT[],
    "applicableStates" JSONB NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'Draft',
    "draftedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_template_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "changedBy" UUID NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "key" TEXT NOT NULL,
    "category" "FeatureFlagCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "legalOpinionRef" TEXT,
    "updatedBy" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flag_override" (
    "id" UUID NOT NULL,
    "flagKey" TEXT NOT NULL,
    "scope" "FeatureFlagScope" NOT NULL,
    "state" "AustralianState",
    "providerId" UUID,
    "facilityId" UUID,
    "isEnabled" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "changedBy" UUID NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flag_override_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradingName" TEXT,
    "abn" TEXT NOT NULL,
    "status" "ProviderStatus" NOT NULL DEFAULT 'Draft',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "suspensionReason" TEXT,
    "terminationNoticeOn" DATE,
    "dataReturnConfirmedAt" TIMESTAMP(3),
    "alwaysDenyContentAccess" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "regionId" UUID,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "suburb" TEXT NOT NULL,
    "state" "AustralianState" NOT NULL,
    "postcode" TEXT NOT NULL,
    "isStateGovernmentOperated" BOOLEAN NOT NULL DEFAULT false,
    "status" "FacilityStatus" NOT NULL DEFAULT 'Onboarding',
    "rulePackId" TEXT,
    "operationalBeds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "limits" JSONB NOT NULL,
    "contractStart" DATE,
    "contractEnd" DATE,
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'NotInvoiced',
    "accountingRef" TEXT,
    "updatedBy" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_status" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "documentType" "ComplianceDocumentType" NOT NULL,
    "status" "ComplianceStatusValue" NOT NULL DEFAULT 'NotStarted',
    "effectiveOn" DATE,
    "expiresOn" DATE,
    "carekindOwnerId" UUID,
    "providerOwnerName" TEXT,
    "providerOwnerPosition" TEXT,
    "externalRef" TEXT,
    "hasNonStandardTerms" BOOLEAN NOT NULL DEFAULT false,
    "nonStandardApprovedOn" DATE,
    "notes" TEXT,
    "updatedBy" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breach_notification_registration" (
    "providerId" UUID NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPosition" TEXT NOT NULL,
    "regime" "BreachRegime" NOT NULL,
    "carekindCommitmentHours" INTEGER NOT NULL DEFAULT 24,
    "updatedBy" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breach_notification_registration_pkey" PRIMARY KEY ("providerId")
);

-- CreateTable
CREATE TABLE "go_live_checklist_item" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "itemNumber" INTEGER NOT NULL,
    "isGoLiveGate" BOOLEAN NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedBy" UUID,
    "source" "GoLiveItemSource" NOT NULL,

    CONSTRAINT "go_live_checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_member" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "preferredName" TEXT,
    "loginEmail" TEXT NOT NULL,
    "passwordHash" TEXT,
    "nurseAppRole" "NurseAppRole" NOT NULL,
    "registrationType" "RegistrationType" NOT NULL DEFAULT 'None',
    "ahpraNumber" TEXT,
    "registrationAttestedBy" UUID,
    "registrationAttestedAt" TIMESTAMP(3),
    "preferredLanguage" TEXT,
    "status" "StaffStatus" NOT NULL DEFAULT 'Invited',
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "deactivationReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_facility_assignment" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "unitIds" UUID[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_facility_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_role_assignment" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "role" "PortalRole" NOT NULL,
    "regionId" UUID,
    "facilityId" UUID,
    "grantedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_role_grant_request" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "role" "PortalRole" NOT NULL,
    "scope" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'Pending',
    "requestedBy" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" UUID,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "clinical_role_grant_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_onboarding_step" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "stepId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedBy" UUID,

    CONSTRAINT "staff_onboarding_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resident" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "unitId" UUID,
    "room" TEXT,
    "legalName" TEXT NOT NULL,
    "preferredName" TEXT,
    "dateOfBirth" DATE NOT NULL,
    "facilityResidentId" TEXT NOT NULL,
    "cmsId" TEXT,
    "status" "ResidentStatus" NOT NULL DEFAULT 'PreAdmission',
    "startDay" DATE,
    "departedOn" DATE,
    "aiDocumentationConsent" "AiDocumentationConsent" NOT NULL DEFAULT 'Pending',
    "isRecordingOptedOut" BOOLEAN NOT NULL DEFAULT false,
    "consentSource" JSONB,
    "consentRecordedOn" DATE,
    "consentRecordedBy" UUID,
    "hasSimilarNameFlag" BOOLEAN NOT NULL DEFAULT false,
    "roomChangedAt" TIMESTAMP(3),
    "createdByImportBatchId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resident_location_event" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "residentId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "unitId" UUID,
    "room" TEXT,
    "kind" "LocationEventKind" NOT NULL,
    "reason" "RoomChangeReason",
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "changedBy" UUID NOT NULL,

    CONSTRAINT "resident_location_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resident_consent_event" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "residentId" UUID NOT NULL,
    "aiDocumentation" "AiDocumentationConsent" NOT NULL,
    "isRecordingOptedOut" BOOLEAN NOT NULL,
    "source" JSONB NOT NULL,
    "recordedOn" DATE NOT NULL,
    "recordedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resident_consent_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resident_contact" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "residentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "roleType" "ContactRoleType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resident_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resident_transfer" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "residentId" UUID NOT NULL,
    "fromFacilityId" UUID NOT NULL,
    "toFacilityId" UUID NOT NULL,
    "toUnitId" UUID,
    "toRoom" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "reasonCategory" "TransferReasonCategory" NOT NULL,
    "status" "TransferStatus" NOT NULL,
    "blockers" JSONB NOT NULL,
    "initiatedBy" UUID NOT NULL,
    "acceptedBy" UUID,
    "acceptedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resident_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_import_batch" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileChecksum" TEXT NOT NULL,
    "status" "RosterBatchStatus" NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "requiresSecondConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" UUID NOT NULL,
    "confirmedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "roster_import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_import_row" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "rowNumber" INTEGER,
    "status" "RosterRowStatus" NOT NULL,
    "parsed" JSONB,
    "matchedResidentId" UUID,
    "issues" TEXT[],
    "decision" "RosterRowDecision" NOT NULL DEFAULT 'Undecided',
    "decisionReason" TEXT,
    "decidedBy" UUID,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "roster_import_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_version" (
    "id" UUID NOT NULL,
    "providerId" UUID,
    "facilityId" UUID,
    "layer" "ConfigLayer" NOT NULL,
    "item" "WorkflowItem" NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "status" "ConfigVersionStatus" NOT NULL,
    "changedBy" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "effectiveMode" "EffectiveMode" NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "restoredFromVersionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_access_request" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "ticketRef" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" "SupportAccessScope" NOT NULL,
    "target" JSONB NOT NULL,
    "includesHealthInformation" BOOLEAN NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "SupportAccessStatus" NOT NULL DEFAULT 'Pending',
    "requestedBy" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "startedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "revokedBy" UUID,
    "accessSummary" JSONB,
    "isPreGenerated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "support_access_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "providerId" UUID,
    "facilityId" UUID,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "context" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "super_admin_user_email_key" ON "super_admin_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "permission_group_key_key" ON "permission_group"("key");

-- CreateIndex
CREATE UNIQUE INDEX "session_refreshTokenHash_key" ON "session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "session_providerId_createdAt_idx" ON "session"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "session_subjectId_audience_idx" ON "session"("subjectId", "audience");

-- CreateIndex
CREATE INDEX "session_familyId_idx" ON "session"("familyId");

-- CreateIndex
CREATE INDEX "approval_request_providerId_status_idx" ON "approval_request"("providerId", "status");

-- CreateIndex
CREATE INDEX "approval_request_status_createdAt_idx" ON "approval_request"("status", "createdAt");

-- CreateIndex
CREATE INDEX "state_rule_pack_state_status_idx" ON "state_rule_pack"("state", "status");

-- CreateIndex
CREATE INDEX "document_template_version_status_idx" ON "document_template_version"("status");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_version_templateName_version_key" ON "document_template_version"("templateName", "version");

-- CreateIndex
CREATE INDEX "feature_flag_override_providerId_flagKey_idx" ON "feature_flag_override"("providerId", "flagKey");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_override_flagKey_scope_state_providerId_facili_key" ON "feature_flag_override"("flagKey", "scope", "state", "providerId", "facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_slug_key" ON "provider"("slug");

-- CreateIndex
CREATE INDEX "provider_isDemo_status_idx" ON "provider"("isDemo", "status");

-- CreateIndex
CREATE INDEX "region_providerId_idx" ON "region"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "region_providerId_name_key" ON "region"("providerId", "name");

-- CreateIndex
CREATE INDEX "facility_providerId_idx" ON "facility"("providerId");

-- CreateIndex
CREATE INDEX "facility_providerId_state_idx" ON "facility"("providerId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "facility_providerId_name_key" ON "facility"("providerId", "name");

-- CreateIndex
CREATE INDEX "unit_providerId_facilityId_idx" ON "unit"("providerId", "facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_facilityId_name_key" ON "unit"("facilityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "plan_providerId_key" ON "plan"("providerId");

-- CreateIndex
CREATE INDEX "plan_providerId_idx" ON "plan"("providerId");

-- CreateIndex
CREATE INDEX "compliance_status_providerId_idx" ON "compliance_status"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_status_providerId_documentType_key" ON "compliance_status"("providerId", "documentType");

-- CreateIndex
CREATE INDEX "go_live_checklist_item_providerId_facilityId_idx" ON "go_live_checklist_item"("providerId", "facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "go_live_checklist_item_facilityId_itemNumber_key" ON "go_live_checklist_item"("facilityId", "itemNumber");

-- CreateIndex
CREATE INDEX "staff_member_providerId_status_idx" ON "staff_member"("providerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_member_providerId_loginEmail_key" ON "staff_member"("providerId", "loginEmail");

-- CreateIndex
CREATE INDEX "staff_facility_assignment_providerId_facilityId_idx" ON "staff_facility_assignment"("providerId", "facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_facility_assignment_staffId_facilityId_key" ON "staff_facility_assignment"("staffId", "facilityId");

-- CreateIndex
CREATE INDEX "portal_role_assignment_providerId_staffId_idx" ON "portal_role_assignment"("providerId", "staffId");

-- CreateIndex
CREATE INDEX "portal_role_assignment_providerId_role_idx" ON "portal_role_assignment"("providerId", "role");

-- CreateIndex
CREATE INDEX "clinical_role_grant_request_providerId_status_idx" ON "clinical_role_grant_request"("providerId", "status");

-- CreateIndex
CREATE INDEX "staff_onboarding_step_providerId_staffId_idx" ON "staff_onboarding_step"("providerId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_onboarding_step_staffId_stepId_key" ON "staff_onboarding_step"("staffId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tokenHash_key" ON "invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "invitation_providerId_staffId_idx" ON "invitation"("providerId", "staffId");

-- CreateIndex
CREATE INDEX "resident_providerId_facilityId_status_idx" ON "resident"("providerId", "facilityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "resident_providerId_facilityResidentId_key" ON "resident"("providerId", "facilityResidentId");

-- CreateIndex
CREATE INDEX "resident_location_event_providerId_residentId_idx" ON "resident_location_event"("providerId", "residentId");

-- CreateIndex
CREATE INDEX "resident_location_event_providerId_facilityId_room_idx" ON "resident_location_event"("providerId", "facilityId", "room");

-- CreateIndex
CREATE INDEX "resident_consent_event_providerId_residentId_idx" ON "resident_consent_event"("providerId", "residentId");

-- CreateIndex
CREATE INDEX "resident_contact_providerId_residentId_idx" ON "resident_contact"("providerId", "residentId");

-- CreateIndex
CREATE INDEX "resident_transfer_providerId_residentId_idx" ON "resident_transfer"("providerId", "residentId");

-- CreateIndex
CREATE INDEX "resident_transfer_providerId_toFacilityId_status_idx" ON "resident_transfer"("providerId", "toFacilityId", "status");

-- CreateIndex
CREATE INDEX "roster_import_batch_providerId_facilityId_createdAt_idx" ON "roster_import_batch"("providerId", "facilityId", "createdAt");

-- CreateIndex
CREATE INDEX "roster_import_row_providerId_batchId_idx" ON "roster_import_row"("providerId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "roster_import_row_batchId_position_key" ON "roster_import_row"("batchId", "position");

-- CreateIndex
CREATE INDEX "config_version_providerId_facilityId_item_status_idx" ON "config_version"("providerId", "facilityId", "item", "status");

-- CreateIndex
CREATE UNIQUE INDEX "config_version_layer_providerId_facilityId_item_versionNumb_key" ON "config_version"("layer", "providerId", "facilityId", "item", "versionNumber");

-- CreateIndex
CREATE INDEX "support_access_request_providerId_status_idx" ON "support_access_request"("providerId", "status");

-- CreateIndex
CREATE INDEX "support_access_request_requestedBy_status_idx" ON "support_access_request"("requestedBy", "status");

-- CreateIndex
CREATE UNIQUE INDEX "audit_event_seq_key" ON "audit_event"("seq");

-- CreateIndex
CREATE INDEX "audit_event_providerId_seq_idx" ON "audit_event"("providerId", "seq");

-- CreateIndex
CREATE INDEX "audit_event_providerId_occurredAt_idx" ON "audit_event"("providerId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_providerId_facilityId_occurredAt_idx" ON "audit_event"("providerId", "facilityId", "occurredAt");

-- AddForeignKey
ALTER TABLE "super_admin_group_membership" ADD CONSTRAINT "super_admin_group_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "super_admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_admin_group_membership" ADD CONSTRAINT "super_admin_group_membership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "permission_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_override" ADD CONSTRAINT "feature_flag_override_flagKey_fkey" FOREIGN KEY ("flagKey") REFERENCES "feature_flag"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region" ADD CONSTRAINT "region_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility" ADD CONSTRAINT "facility_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility" ADD CONSTRAINT "facility_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit" ADD CONSTRAINT "unit_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_facility_assignment" ADD CONSTRAINT "staff_facility_assignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_role_assignment" ADD CONSTRAINT "portal_role_assignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_onboarding_step" ADD CONSTRAINT "staff_onboarding_step_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resident_location_event" ADD CONSTRAINT "resident_location_event_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resident_consent_event" ADD CONSTRAINT "resident_consent_event_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resident_contact" ADD CONSTRAINT "resident_contact_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_import_row" ADD CONSTRAINT "roster_import_row_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "roster_import_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
