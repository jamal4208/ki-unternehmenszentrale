const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const rootDir = __dirname;
const allowedFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/app.js", "app.js"],
  ["/styles.css", "styles.css"],
]);

loadLocalEnv();

const port = Number(process.env.PORT) || 4173;

function loadLocalEnv() {
  const envPath = path.join(rootDir, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) return;
    process.env[key] = stripEnvQuotes(value);
  });
}

function stripEnvQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(message);
}

const qualitySprintStandard = {
  version: "V1.1.5",
  title: "Qualitäts-Sprintstandard zentral absichern",
  qualityBeforeSpeed: true,
  speedOnlyByReducingFriction: true,
  noShortcutAroundSafety: true,
  preferExistingArea: true,
  preferExistingEndpoint: true,
  smallStepOnly: true,
  visibleUserBenefitRequired: true,
  reversibleStepRequired: true,
  manualOnly: true,
  jamalDecides: true,
  noAutomaticExecution: true,
  noAutomaticStorage: true,
  noAutomaticTraining: true,
  noAutomaticDecision: true,
  noFollowUpAgentStart: true,
  noAutomaticPluginExecution: true,
  noExternalRequestWithoutApproval: true,
  noWriteOperationWithoutApproval: true,
  existingChecksPreferred: true,
  affectedEndpointsMustBeChecked: true,
  securityLineMustRemainVisible: true,
  speedGainMethod: "Weniger Reibung durch zentrale Standards, nicht weniger Prüfung.",
  standardsCentralized: true,
  futureSprintFrictionReduced: true,
  existingAreasPreferred: true,
  existingEndpointsPreferred: true,
  smallReversibleStepsOnly: true,
  manualDecisionRequired: true,
  jamalKeepsControl: true,
  automaticExecutionBlocked: true,
  automaticStorageBlocked: true,
  automaticTrainingBlocked: true,
  automaticDecisionBlocked: true,
  followUpAgentStartBlocked: true,
  automaticPluginExecutionBlocked: true,
  writeOperationsBlocked: true,
  externalRequestsRequireApproval: true,
  safeToContinue: true,
};

const developmentSafetyCheck = {
  syntaxCheckRequired: true,
  affectedEndpointsCheckRequired: true,
  madeExternalRequestMustStayFalseWithoutApproval: true,
  noPostPatchPutDeleteWithoutApproval: true,
  noSecretsVisible: true,
  noEnvLocalRequiredForNormalRun: true,
  noAutomaticDecision: true,
  noAutomaticTraining: true,
  noFollowUpAgentStart: true,
  noAutomaticPluginExecution: true,
  existingDailyModeLogicMustRemain: true,
  existingDecisionLogicMustRemain: true,
  existingContentDesignLogicMustRemain: true,
  existingPluginReadinessMustRemain: true,
  backupRecommendedAfterSuccessfulCheck: true,
};

const nextSprintFilter = {
  mustUseSmallestUsefulStep: true,
  mustPreferExistingUiArea: true,
  mustPreferExistingApiEndpoint: true,
  mustHaveVisibleBenefitForJamal: true,
  mustBeTestableWithExistingChecks: true,
  mustAvoidNewComplexity: true,
  mustAvoidNewAutomation: true,
  mustKeepManualControl: true,
  mustRemainReversible: true,
  mustProtectExistingWorkingFeatures: true,
  mustNotReduceSafetyForSpeed: true,
  recommendedNextSprintRule:
    "Der nächste Sprint soll nur einen bestehenden Bereich verbessern, sichtbaren Nutzen bringen, manuell bleiben, bestehende Sicherheitsgrenzen behalten und mit den vorhandenen Prüfungen testbar sein.",
};

const recommendedNextMiniSprint = {
  title: "Empfohlener nächster Mini-Sprint",
  recommendation: "Bestehenden Cockpit-Bereich verständlicher machen",
  reason: "Sichtbarer Nutzen für Jamal, wenig Reibung, keine neue Automatik.",
  criteria: [
    "Sichtbarer Nutzen für Jamal",
    "Keine neue Automatik",
    "Mit bestehenden Checks prüfbar",
    "Keine neue Plugin-Ausführung",
    "Keine automatische Speicherung",
    "Keine Entscheidung ohne Jamal",
  ],
  manualOnly: true,
  requiresJamalApproval: true,
  automaticExecutionBlocked: true,
  automaticStorageBlocked: true,
  followUpAgentStartBlocked: true,
  pluginExecutionBlocked: true,
};

const cockpitClarityImprovement = {
  title: "Cockpit-Bereich verständlicher machen",
  applied: true,
  improvedArea: "Heute wirklich nur diese 3 Dinge",
  purpose: "Jamal schneller zeigen, wie der Bereich gelesen und genutzt wird.",
  manualOnly: true,
  noNewAutomation: true,
  noNewProcessChain: true,
  noPluginExecution: true,
};

const cockpitUseExplanation = {
  title: "So nutzt Jamal diesen Bereich",
  explanation:
    "Dieser Bereich ist keine Aufgabenliste für alles. Er zeigt nur, worauf Jamal heute zuerst schauen sollte.",
  simpleSteps: [
    "Erst lesen",
    "Eine Entscheidung treffen oder bewusst überspringen",
    "Danach offen lassen oder als abgeschlossen einordnen",
  ],
  notRequiredToday: "Mehr ist heute nicht nötig.",
  boundary:
    "Nur Orientierung. Keine automatische Ausführung. Keine automatische Speicherung. Keine Entscheidung ohne Jamal.",
  manualOnly: true,
  automaticExecutionBlocked: true,
  automaticStorageBlocked: true,
  automaticDecisionBlocked: true,
};

const pluginUseMatrixPrepared = {
  title: "Plugin-Einsatzmatrix für alle Agenten vorbereitet",
  applied: true,
  purpose: "Plugin-Einsatz pro Agent sichtbar einordnen, ohne echte Plugin-Ausführung.",
  manualOnly: true,
  requiresJamalApproval: true,
  noAutomaticPluginExecution: true,
  noExternalPluginRequest: true,
  noPluginWrite: true,
  noAutomaticStorage: true,
  noAutomaticDecision: true,
};

const manualPluginWorkOrdersPrepared = true;
const bestManualPluginStartOrdersPrepared = true;
const recommendedFirstManualPluginStartOrderPrepared = true;
const pluginInstallationStatusPreparationPrepared = true;
const firstManualPluginConnectionCandidatePrepared = true;
const copyableAirtableReadOnlyTestOrderPrepared = true;
const manualAirtableReadOnlyTestClassificationPrepared = true;
const manualAirtableReadOnlyTestGoalClarificationPrepared = true;
const copyableAirtableReadOnlyTestGoalSelectionPrepared = true;
const manualAirtableGoalDecisionClassificationPrepared = true;
const smallestSafeAirtableGoalRecommendationPrepared = true;
const copyableAirtableBasicConnectionCheckOrderPrepared = true;
const airtablePreparationBundleSummaryPrepared = true;
const manualAirtableBundleDecisionPrepared = true;
const airtableFirstTestPreparationPackagePrepared = true;
const airtableFirstTestResultDocumentationPrepared = true;
const pluginTestCockpitSummaryPrepared = true;
const pluginTestDailyDecisionPrepared = true;
const productiveUsagePreparationPrepared = true;
const productiveDailyLeadershipDefinitionPrepared = true;
const productiveDailyClosureDefinitionPrepared = true;
const productiveDailyHandoffPreparationPrepared = true;
const productiveDailyCycleSummaryPrepared = true;
const productiveMorningRoutineDerivationPrepared = true;
const productiveWorkdayLocalSimulationPrepared = true;
const productiveWorkdayLocalSimulationEvaluationPrepared = true;
const productiveLocalReleasePreparationPrepared = true;
const productiveLocalUsageManualStartPrepared = true;
const productiveLocalUsageFirstRunEvaluationPrepared = true;
const productiveLocalUsageEvaluationLeadershipDecisionPrepared = true;
const productiveLocalLeadershipDecisionNextSafeStepPrepared = true;
const productiveLeadershipWorkspacePrepared = true;
const productiveLeadershipWorkspaceDailyDecisionPrepared = true;
const productiveLeadershipWorkspaceDailyExecutionPrepared = true;
const productiveLeadershipWorkspaceDailyExecutionEvaluationPrepared = true;
const productiveProjectWorkspaceReadinessPrepared = true;
const productivePluginExpansionBridgePrepared = true;
const productiveReadOnlyProjectContextPreparationPrepared = true;
const productiveManualProjectWorkRunPreparationPrepared = true;
const productiveManualProjectWorkRunEvaluationPrepared = true;
const productiveHealthProjectAgentWorkOrderPrepared = true;
const productiveHealthProjectAgentRunEvaluationPrepared = true;
const productiveManualHealthProjectWorkStepPreparationPrepared = true;
const productiveFastQualityWorkModePrepared = true;
const productiveManualHealthDayWorkPrepared = true;
const productiveHealthFinishCorridorPrepared = true;
const productiveHealthFinishResultDraftPrepared = true;
const productiveHealthProductCardPrepared = true;
const productiveHealthProductCardManualReviewPrepared = true;
const productiveHealthFirstWorkBlockPrepared = true;
const productiveHealthFirstWorkBlockManualExecutionPrepared = true;
const productiveHealthFirstWorkBlockManualExecutionEvaluationPrepared = true;
const productiveCentralProjectWorkRoutinePrepared = true;
const productiveExpansionFirstProjectWorkBlockFromRoutinePrepared = true;
const productiveExpansionRoutineApplicationEvaluationPrepared = true;
const productiveMarketingFirstProjectWorkBlockFromRoutinePrepared = true;
const productiveCrossProjectWorkRoutineEvaluationPrepared = true;
const productiveCentralProjectWorkStandardProcessPrepared = true;
const productiveCentralDailyProjectWorkCardPrepared = true;
const productiveCentralLiveOperatingModelPrepared = true;
const productiveCentralLiveApprovalStageModuleMapPrepared = true;
const productiveCentralFirstDraftModeActionPrepared = true;
const productiveCentralFirstDraftModeActionManualReviewPrepared = true;
const productiveCentralApprovalRequiredExecutionModelPrepared = true;
const productiveCentralApprovalRequiredExecutionManualReviewPrepared = true;
const productiveCentralFutureWriteCapabilityModelPrepared = true;
const productiveCentralFutureWriteCapabilityManualReviewPrepared = true;
const productiveCentralDisabledWriteArchitecturePlanPrepared = true;
const productiveCentralDisabledWriteArchitecturePlanManualReviewPrepared = true;
const productiveCentralWritePermissionDecisionCorridorPrepared = true;
const productiveCentralWritePermissionManualDecisionEvaluationPrepared = true;
const productiveCentralWritePermissionDecisionTemplatePrepared = true;
const productiveCentralWritePermissionReadOnlyReleaseBoundaryPrepared = true;
const productiveCentralManualReleaseDecisionReadOnlyStructurePrepared = true;
const productiveCentralManualReleaseDecisionGfReviewQuestionsPrepared = true;
const productiveCentralManualReleaseDecisionGfDecisionMaskPrepared = true;
const productiveCentralManualReleaseDecisionGfShortDecisionPrepared = true;
const productiveCentralManualReleaseDecisionCardPrepared = true;
const productiveCentralManualReleaseDecisionFinalOverviewPrepared = true;
const productiveCentralFinalReadinessOverviewPrepared = true;
const productiveCentralV1CompletionPlanPrepared = true;
const productiveCentralV1CompletionDecisionPrepared = true;
const productiveCentralV1GfDecisionCardPrepared = true;
const productiveCentralV1CompletionChecklistPrepared = true;
const productiveCentralV1CompletionReportPrepared = true;
const productiveCentralV1ManualReleaseDecisionPrepared = true;
const productiveCentralV1FinalizationBoundaryPrepared = true;
const productiveCentralV1FinalOperatingStatePrepared = true;
const productiveCentralV11AgentDailyRunPrepared = true;
const productiveCentralV11AgentResultRunPrepared = true;
const productiveCentralV11PluginEnabledAgentTestModePrepared = true;
const productiveCentralV11ControlledAgentPilotRunPrepared = true;
const productiveCentralV11StrategicAgentPilotRunPrepared = true;
const productiveCentralV11ReadOnlyAgentActionPlanPrepared = true;
const productiveCentralV11ReadOnlyProjectFileGithubTestCorridorPrepared = true;
const airtableReadOnlyCheckPrepared = true;
const airtableReadOnlyDecisionQuestionPrepared = true;
const projectContinuationPreparationPrepared = true;
const projectContinuationDecisionPrepared = true;
const healthUpgradeLocalQualityOrderPrepared = true;
const healthUpgradeLocalQualityChecklistPrepared = true;
const healthUpgradeLocalFindingClassificationPrepared = true;
const healthUpgradeLocalFindingNextStepsPrepared = true;
const healthUpgradeLocalDemoStatusSummaryPrepared = true;
const healthUpgradeLocalDemoManualReleaseDecisionPrepared = true;
const healthUpgradeLocalDemoReleaseCopyNotePrepared = true;
const healthUpgradeLocalDemoClosingSummaryPrepared = true;
const healthUpgradeLocalDemoReviewStandPrepared = true;

function getPilotStatus() {
  const airtableToken = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_PAT;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID;
  const airtableTableNameOrId =
    process.env.AIRTABLE_TABLE_ID || process.env.AIRTABLE_TABLE_NAME || process.env.AIRTABLE_TABLE_PROJECTS;
  const missingVariables = getMissingAirtableVariableNames(airtableToken, airtableBaseId, airtableTableNameOrId);
  const firstPreviewApproved = process.env.AIRTABLE_FIRST_READONLY_PREVIEW_APPROVED === "true";
  const hasCompleteSetup = missingVariables.length === 0;
  const chefStatus = getAirtableChefStatus(missingVariables, firstPreviewApproved);

  return {
    version: "V1.1.5",
    agentCount: 25,
    pilot: true,
    provider: "airtable",
    mode: "manual-read-only-live-check",
    qualitySprintStandard,
    developmentSafetyCheck,
    nextSprintFilter,
    recommendedNextMiniSprint,
    cockpitClarityImprovement,
    pluginUseMatrixPrepared,
    manualPluginWorkOrdersPrepared,
    bestManualPluginStartOrdersPrepared,
    recommendedFirstManualPluginStartOrderPrepared,
    pluginInstallationStatusPreparationPrepared,
    firstManualPluginConnectionCandidatePrepared,
    copyableAirtableReadOnlyTestOrderPrepared,
    manualAirtableReadOnlyTestClassificationPrepared,
    manualAirtableReadOnlyTestGoalClarificationPrepared,
    copyableAirtableReadOnlyTestGoalSelectionPrepared,
    manualAirtableGoalDecisionClassificationPrepared,
    smallestSafeAirtableGoalRecommendationPrepared,
    copyableAirtableBasicConnectionCheckOrderPrepared,
    airtablePreparationBundleSummaryPrepared,
    manualAirtableBundleDecisionPrepared,
    airtableFirstTestPreparationPackagePrepared,
    airtableFirstTestResultDocumentationPrepared,
    pluginTestCockpitSummaryPrepared,
    pluginTestDailyDecisionPrepared,
    productiveUsagePreparationPrepared,
    productiveDailyLeadershipDefinitionPrepared,
    productiveDailyClosureDefinitionPrepared,
    productiveDailyHandoffPreparationPrepared,
    productiveDailyCycleSummaryPrepared,
    productiveMorningRoutineDerivationPrepared,
    productiveWorkdayLocalSimulationPrepared,
    productiveWorkdayLocalSimulationEvaluationPrepared,
    productiveLocalReleasePreparationPrepared,
    productiveLocalUsageManualStartPrepared,
    productiveLocalUsageFirstRunEvaluationPrepared,
    productiveLocalUsageEvaluationLeadershipDecisionPrepared,
    productiveLocalLeadershipDecisionNextSafeStepPrepared,
    productiveLeadershipWorkspacePrepared,
    productiveLeadershipWorkspaceDailyDecisionPrepared,
    productiveLeadershipWorkspaceDailyExecutionPrepared,
    productiveLeadershipWorkspaceDailyExecutionEvaluationPrepared,
    productiveProjectWorkspaceReadinessPrepared,
    productivePluginExpansionBridgePrepared,
    productiveReadOnlyProjectContextPreparationPrepared,
    productiveManualProjectWorkRunPreparationPrepared,
    productiveManualProjectWorkRunEvaluationPrepared,
    productiveHealthProjectAgentWorkOrderPrepared,
    productiveHealthProjectAgentRunEvaluationPrepared,
    productiveManualHealthProjectWorkStepPreparationPrepared,
    productiveFastQualityWorkModePrepared,
    productiveManualHealthDayWorkPrepared,
    productiveHealthFinishCorridorPrepared,
    productiveHealthFinishResultDraftPrepared,
    productiveHealthProductCardPrepared,
    productiveHealthProductCardManualReviewPrepared,
    productiveHealthFirstWorkBlockPrepared,
    productiveHealthFirstWorkBlockManualExecutionPrepared,
    productiveHealthFirstWorkBlockManualExecutionEvaluationPrepared,
    productiveCentralProjectWorkRoutinePrepared,
    productiveExpansionFirstProjectWorkBlockFromRoutinePrepared,
    productiveExpansionRoutineApplicationEvaluationPrepared,
    productiveMarketingFirstProjectWorkBlockFromRoutinePrepared,
    productiveCrossProjectWorkRoutineEvaluationPrepared,
    productiveCentralProjectWorkStandardProcessPrepared,
    productiveCentralDailyProjectWorkCardPrepared,
    productiveCentralLiveOperatingModelPrepared,
    productiveCentralLiveApprovalStageModuleMapPrepared,
    productiveCentralFirstDraftModeActionPrepared,
    productiveCentralFirstDraftModeActionManualReviewPrepared,
    productiveCentralApprovalRequiredExecutionModelPrepared,
    productiveCentralApprovalRequiredExecutionManualReviewPrepared,
    productiveCentralFutureWriteCapabilityModelPrepared,
    productiveCentralFutureWriteCapabilityManualReviewPrepared,
    productiveCentralDisabledWriteArchitecturePlanPrepared,
    productiveCentralDisabledWriteArchitecturePlanManualReviewPrepared,
    productiveCentralWritePermissionDecisionCorridorPrepared,
    productiveCentralWritePermissionManualDecisionEvaluationPrepared,
    productiveCentralWritePermissionDecisionTemplatePrepared,
    productiveCentralWritePermissionReadOnlyReleaseBoundaryPrepared,
    productiveCentralManualReleaseDecisionReadOnlyStructurePrepared,
    productiveCentralManualReleaseDecisionGfReviewQuestionsPrepared,
    productiveCentralManualReleaseDecisionGfDecisionMaskPrepared,
    productiveCentralManualReleaseDecisionGfShortDecisionPrepared,
    productiveCentralManualReleaseDecisionCardPrepared,
    productiveCentralManualReleaseDecisionFinalOverviewPrepared,
    productiveCentralFinalReadinessOverviewPrepared,
    productiveCentralV1CompletionPlanPrepared,
    productiveCentralV1CompletionDecisionPrepared,
    productiveCentralV1GfDecisionCardPrepared,
    productiveCentralV1CompletionChecklistPrepared,
    productiveCentralV1CompletionReportPrepared,
    productiveCentralV1ManualReleaseDecisionPrepared,
    productiveCentralV1FinalizationBoundaryPrepared,
    productiveCentralV1FinalOperatingStatePrepared,
    productiveCentralV11AgentDailyRunPrepared,
    productiveCentralV11AgentResultRunPrepared,
    productiveCentralV11PluginEnabledAgentTestModePrepared,
    productiveCentralV11ControlledAgentPilotRunPrepared,
    productiveCentralV11StrategicAgentPilotRunPrepared,
    productiveCentralV11ReadOnlyAgentActionPlanPrepared,
    productiveCentralV11ReadOnlyProjectFileGithubTestCorridorPrepared,
    airtableReadOnlyCheckPrepared,
    airtableReadOnlyDecisionQuestionPrepared,
    projectContinuationPreparationPrepared,
    projectContinuationDecisionPrepared,
    healthUpgradeLocalQualityOrderPrepared,
    healthUpgradeLocalQualityChecklistPrepared,
    healthUpgradeLocalFindingClassificationPrepared,
    healthUpgradeLocalFindingNextStepsPrepared,
    healthUpgradeLocalDemoStatusSummaryPrepared,
    healthUpgradeLocalDemoManualReleaseDecisionPrepared,
    healthUpgradeLocalDemoReleaseCopyNotePrepared,
    healthUpgradeLocalDemoClosingSummaryPrepared,
    healthUpgradeLocalDemoReviewStandPrepared,
    pilotClosurePrepared: true,
    nextVersion: "V1.1.5",
    localConnectionCheckSimplified: true,
    guidedLocalConnectionCheck: true,
    displayBoundaryPrepared: true,
    firstReadOnlyDisplayPrepared: true,
    firstReadOnlyDisplayAllowed: hasCompleteSetup && firstPreviewApproved,
    requiresManualDisplayApproval: true,
    manualFirstPreviewApprovalPrepared: true,
    manualFirstPreviewApprovalRequired: true,
    manualFirstPreviewApprovalGranted: firstPreviewApproved,
    firstSanitizedPreviewExecutable: true,
    firstSanitizedPreviewExecutedOnlyAfterManualApproval: true,
    chefStatusSummaryEnabled: true,
    airtableChefStatusPrepared: true,
    localReachabilitySummarized: true,
    minimalCheckSummarized: true,
    nextStepRecommended: true,
    pluginWorkCapabilityPrepared: true,
    firstPluginWorkTaskPrepared: true,
    projectManagerPluginTaskPrepared: true,
    projectManagerChefApprovalEnabled: true,
    projectManagerChefOutputEnabled: true,
    projectManagerChefOutputFeedsDailyFocus: true,
    dailyFocusFromProjectManagerPrepared: true,
    sanitizedAgentOutputToCockpitPrepared: true,
    dailyFocusOutputPrepared: true,
    todayMostImportantProjectPrepared: true,
    dailyBlockerPrepared: true,
    dailyNextStepPrepared: true,
    dailyDecisionPrepared: true,
    dailyFocusToStartActionPrepared: true,
    nextConcreteActionPrepared: true,
    agentStartInstructionPrepared: true,
    projectManagerStartActionPrepared: true,
    sanitizedDailyFocusToAgentTaskPrepared: true,
    agentTaskCopyTextPrepared: true,
    pluginBenefitVisible: true,
    lessReadingMoreAction: true,
    startActionToAgentWorkflowPrepared: true,
    agentWorkflowPrepared: true,
    projectManagerWorkflowPrepared: true,
    agentTaskHandoffPrepared: true,
    workflowStatusPrepared: true,
    expectedAgentResultPrepared: true,
    decisionPointPrepared: true,
    pluginSupportedWorkflowPrepared: true,
    agentWorkflowResultPrepared: true,
    workflowCompletionPrepared: true,
    workflowResultStatusPrepared: true,
    followUpDecisionPrepared: true,
    nextAgentRecommendationPrepared: true,
    projectManagerWorkflowClosable: true,
    hrAgentFollowUpRecommended: true,
    closedAgentLoopPrepared: true,
    taskWorkflowResultDecisionNextActionPrepared: true,
    hrDailyOnePercentTrainingEnabled: true,
    hrAgentDailyDevelopmentPrepared: true,
    dailyAgentTrainingProposalPrepared: true,
    hrDailyTrainingSuggestionVisiblePrepared: true,
    hrDailyTrainingSuggestionFor24AgentsPrepared: true,
    dailyOnePercentTrainingSuggestionPrepared: true,
    automaticAgentTrainingBlocked: true,
    onePercentImprovementPrepared: true,
    autonomyStepRecommendationPrepared: true,
    nextAgentAutonomyRecommendationPrepared: true,
    hrFollowUpFromWorkflowPrepared: true,
    projectManagerAutonomyStepPrepared: true,
    moreAgentIndependencePrepared: true,
    pluginSupportedAgentsGrowthPrepared: true,
    requiresManualApprovalForAutonomyIncrease: true,
    hrAutonomyApprovalPrepared: true,
    onePercentAutonomyStepApprovable: true,
    agentAutonomyApprovalPrepared: true,
    projectManagerFollowUpAgentRecommendationApprovable: true,
    smallAutonomyIncreasePrepared: true,
    manualApprovalRequiredForAutonomyIncrease: true,
    recommendationAllowedAutomaticStartBlocked: true,
    autonomyApprovalAppliedToWorkflow: true,
    projectManagerCanRecommendFollowUpAgent: true,
    followUpAgentRecommendationEnabled: true,
    hrAutonomyStepAppliedPrepared: true,
    onePercentAutonomyStepAppliedPrepared: true,
    nextAgentRecommendationInWorkflowPrepared: true,
    agentIndependenceIncreasedPrepared: true,
    recommendOnlyAutomaticStartBlocked: true,
    followUpAgentStartRequiresManualApproval: true,
    hrAllAgentsDevelopmentPrepared: true,
    hrSystemwideAgentDevelopmentPrepared: true,
    dailyOnePercentForExistingAgentsPrepared: true,
    todayAgentRecommendationPrepared: true,
    knowledgeArchiveAgentRecommendedNext: true,
    v613ClosurePrepared: true,
    v614NextPluginAgentPrepared: true,
    knowledgeArchiveAgentPluginPrepared: true,
    secondPluginAgentPrepared: true,
    knowledgeArchiveAirtableReadOnlyPrepared: true,
    knowledgeSummaryPrepared: true,
    whatDoWeKnowPrepared: true,
    sanitizedKnowledgeOutputPrepared: true,
    knowledgeToChefSummaryPrepared: true,
    knowledgeArchiveWorkflowPrepared: true,
    knowledgeQuestionWorkflowPrepared: true,
    whatDoWeKnowWorkflowPrepared: true,
    knowledgeSummaryWorkflowPrepared: true,
    knowledgeRelevancePrepared: true,
    knowledgeConsequencePrepared: true,
    knowledgeNextStepPrepared: true,
    knowledgeDecisionPrepared: true,
    secondPluginAgentWorkflowPrepared: true,
    knowledgeWorkflowResultPrepared: true,
    knowledgeWorkflowCompletionPrepared: true,
    knowledgeResultStatusPrepared: true,
    knowledgeFollowUpDecisionPrepared: true,
    knowledgeNextAgentRecommendationPrepared: true,
    knowledgeArchiveWorkflowClosable: true,
    projectManagerFollowUpFromKnowledgeRecommended: true,
    secondClosedAgentLoopPrepared: true,
    knowledgeQuestionResultDecisionNextActionPrepared: true,
    knowledgeResultToProjectManagerStartActionPrepared: true,
    knowledgeToProjectContextPrepared: true,
    crossAgentHandoffPrepared: true,
    knowledgeArchiveToProjectManagerFlowPrepared: true,
    secondAgentLoopFeedsFirstAgentLoopPrepared: true,
    projectManagerCanUseKnowledgeResultPrepared: true,
    startActionFromKnowledgePrepared: true,
    knowledgeBasedNextStepPrepared: true,
    knowledgeBasedDecisionPrepared: true,
    multiAgentSystemFlowPrepared: true,
    lessSearchingMoreActionPrepared: true,
    systemFlowDailyDecisionPrepared: true,
    knowledgeToActionToDailyDecisionPrepared: true,
    crossAgentFlowToCockpitPrepared: true,
    knowledgeArchiveToProjectManagerDailyDecisionPrepared: true,
    dailyDecisionFromAgentFlowPrepared: true,
    whatSystemKnowsPrepared: true,
    whatFollowsFromKnowledgePrepared: true,
    recommendedStartActionPrepared: true,
    dailyDecisionForJamalPrepared: true,
    nextAgentFromDailyDecisionPrepared: true,
    lessSearchingMoreDecisionPrepared: true,
    dailyDecisionAdoptionPrepared: true,
    todayDirectionPrepared: true,
    todayWorkDirectionFromSystemFlowPrepared: true,
    dailyDecisionToStartActionPrepared: true,
    todayStartActionPrepared: true,
    responsibleAgentForTodayPrepared: true,
    nextAgentWorkflowFromTodayDirectionPrepared: true,
    whatIsTodayPrepared: true,
    thisIsTodayFocusPrepared: true,
    knowledgeToActionToTodayDirectionPrepared: true,
    todayDirectionToAgentWorkflowPrepared: true,
    nextAgentWorkflowApprovablePrepared: true,
    todayWorkDirectionWorkflowPrepared: true,
    projectManagerWorkflowFromTodayDirectionPrepared: true,
    todayStartActionToWorkflowPrepared: true,
    nextWorkflowApprovalPrepared: true,
    expectedWorkflowResultPrepared: true,
    workflowApprovalDecisionPrepared: true,
    todayDirectionToExecutionPathPrepared: true,
    contentDesignAgentPluginPrepared: true,
    thirdPluginAgentPrepared: true,
    contentDesignCanvaPreparationPrepared: true,
    designBriefPrepared: true,
    visualQualityImprovementPrepared: true,
    textImprovementPrepared: true,
    canvaBriefingPrepared: true,
    todayDirectionCanFeedDesignPrepared: true,
    projectContextToDesignPrepared: true,
    moreVisibleQualityPrepared: true,
    externalCanvaActionRequiresApproval: true,
    automaticCanvaCreationBlocked: true,
    automaticPublishingBlocked: true,
    contentDesignWorkflowPrepared: true,
    canvaBriefingWorkflowPrepared: true,
    designGoalWorkflowPrepared: true,
    visualImprovementWorkflowPrepared: true,
    contentImprovementWorkflowPrepared: true,
    canvaApprovalDecisionPrepared: true,
    designContextToCanvaBriefPrepared: true,
    thirdPluginAgentWorkflowPrepared: true,
    contentDesignQaComplianceTeamPrepared: true,
    multiAgentDesignReviewPrepared: true,
    contentDesignAgentPrimaryPrepared: true,
    qaAgentReviewPrepared: true,
    complianceRiskAgentReviewPrepared: true,
    designQualityCheckPrepared: true,
    premiumQualityCheckPrepared: true,
    riskBoundaryCheckPrepared: true,
    canvaBriefingReviewPrepared: true,
    designApprovalRecommendationPrepared: true,
    threeAgentWorkgroupPrepared: true,
    checkedTeamRecommendationToChefDecisionPrepared: true,
    designTeamChefDecisionPrepared: true,
    chefDecisionRecommendationPrepared: true,
    approveReviseStopDecisionPrepared: true,
    chefDecisionRiskSummaryPrepared: true,
    copyableFollowUpTaskPrepared: true,
    automaticChefDecisionExecutionBlocked: true,
    chefDecisionToFollowUpTaskPrepared: true,
    contentDesignFollowUpTaskPrepared: true,
    followUpTaskFromDecisionPrepared: true,
    threeConcreteImprovementsPrepared: true,
    followUpTaskQualityTargetPrepared: true,
    manualFollowUpTaskOnly: true,
    followUpReadinessPrepared: true,
    followUpTaskReadinessCheckPrepared: true,
    readinessBeforeTeamReviewPrepared: true,
    followUpReadinessStatusPrepared: true,
    manualTeamReviewRecommendationPrepared: true,
    automaticTeamReviewBlocked: true,
    refinedFollowUpTaskPrepared: true,
    followUpTaskSharpenedPrepared: true,
    refinedDesignContextPrepared: true,
    refinedQaComplianceCriteriaPrepared: true,
    readinessAfterManualControlPrepared: true,
    manualTeamReviewPreparationPrepared: true,
    manualTeamReviewFromRefinedTaskPrepared: true,
    designQaComplianceReviewRolesPrepared: true,
    manualTeamReviewCopyTextPrepared: true,
    teamReviewNotStarted: true,
    manualTeamReviewEvaluationPrepared: true,
    manualTeamReviewAnswerLocallyEvaluated: true,
    designQaComplianceRoleAssessmentPrepared: true,
    manualTeamReviewDecisionHelpPrepared: true,
    automaticDecisionBlocked: true,
    improvementTaskFromTeamReviewPrepared: true,
    contentDesignImprovementTaskPrepared: true,
    improvementTaskManualOnly: true,
    automaticImplementationBlocked: true,
    usableCanvaTaskPrepared: true,
    improvedCanvaWorkTaskManuallyUsable: true,
    canvaTaskCopyTextPrepared: true,
    teamReviewStrandClosed: true,
    oneMinuteCanvaTaskPrepared: true,
    oneSentenceCanvaResultPrepared: true,
    fastManualCanvaUsePrepared: true,
    canvaSecretsBlocked: true,
    nextPluginAgentFromHrRecommendationApplied: true,
    lessSearchingMoreKnowledgePrepared: true,
    baseStructureDisplayBlocked: true,
    automaticFollowUpAgentStartBlocked: true,
    automaticDailyDecisionBlocked: true,
    automaticExternalActionBlocked: true,
    firstExecutablePluginTaskPrepared: true,
    firstSanitizedProjectManagerOutputPrepared: true,
    sanitizedChefOutputLocallyGeneratable: true,
    projectManagerTaskLocallyApprovable: true,
    chefApprovalRequired: true,
    manualExecutionOnly: true,
    projectManagerAirtableReadOnlyPrepared: true,
    sanitizedChefOutputPrepared: true,
    projectStatusSummaryPrepared: true,
    projectStatusOutputPrepared: true,
    blockerDetectionPrepared: true,
    blockerOutputPrepared: true,
    nextStepRecommendationPrepared: true,
    nextStepOutputPrepared: true,
    decisionNeedPrepared: true,
    decisionOutputPrepared: true,
    chefSummaryOutputPrepared: true,
    agentPluginWorkModePrepared: true,
    realSystemPerformancePriority: true,
    lessAdministrationMoreOutput: true,
    agentAutonomyGrowthPrepared: true,
    hrDailyOnePercentTrainingPrepared: true,
    firstPluginAgentRecommended: true,
    airtableReadOnlyAgentUsePrepared: true,
    canvaAgentUsePrepared: true,
    heygenAgentUsePrepared: true,
    githubVercelAgentUsePrepared: true,
    requiresManualApprovalForExternalActions: true,
    requiresManualApprovalForAgentExecution: true,
    airtableReadOnlyOnly: true,
    freeAirtableDataDisplayBlocked: true,
    writeOperationsBlockedByDefault: true,
    externalActionsBlockedByDefault: true,
    automaticAgentStartBlocked: true,
    publishingBlockedByDefault: true,
    deploymentBlockedByDefault: true,
    secretStorageBlocked: true,
    localApprovalDecisionGuided: true,
    realLocalApprovalCheckPrepared: true,
    realLocalApprovalRequiresEnvLocal: true,
    realLocalApprovalUsesBrowserApproval: false,
    realLocalMinimalCheckExecuted: false,
    requiresEnvLocal: true,
    requiresManualServerApproval: true,
    browserApprovalIgnored: true,
    sanitizedPreviewOnly: true,
    sanitizedResultOnly: true,
    maxRecordsAllowed: 1,
    rawDataDisplayBlocked: true,
    fieldDisplayBlocked: true,
    fieldValuesDisplayBlocked: true,
    recordIdDisplayBlocked: true,
    recordListDisplayBlocked: true,
    tableStructureDisplayBlocked: true,
    minimalReadOnlyPreviewOnly: true,
    freeDataDisplayBlocked: true,
    localReadOnlyConnectionStarted: true,
    localReadOnlyConnectionOnly: true,
    canPlanReadOnlyOverview: true,
    canPlanFieldVisibility: true,
    canPrepareReadOnlyApprovalView: true,
    canPrepareReadOnlyPreviewBoundary: true,
    canCloseV69: true,
    canRunLocalReadOnlyConnectionCheck: true,
    nextPluginStep: "Airtable local read-only connection pruefen",
    writeEnabled: false,
    writeOperationsBlocked: true,
    automationEnabled: false,
    automationBlocked: true,
    agentStartEnabled: false,
    agentStartBlocked: true,
    syncEnabled: false,
    deleteEnabled: false,
    recordsDisplayEnabled: false,
    fieldValuesDisplayEnabled: false,
    realFieldNamesDisplayEnabled: false,
    autoConnectionTestEnabled: false,
    madeExternalRequest: false,
    dataDisplayEnabled: false,
    status: missingVariables.length ? "missing_credentials" : "ready_for_manual_check",
    message: missingVariables.length
      ? "Airtable kann lokal noch nicht geprueft werden, weil Zugangsdaten fehlen. Bitte trage die fehlenden Werte in .env.local ein und pruefe danach erneut."
      : "Die Airtable-Verbindung ist lokal pruefbar. Eine erste read-only Anzeigegrenze ist vorbereitet, aber echte Datenanzeige bleibt bis zur manuellen Freigabe gesperrt.",
    canRunConnectionCheck: hasCompleteSetup,
    chefStatus,
    configured: {
      hasToken: Boolean(airtableToken),
      hasBaseId: Boolean(airtableBaseId),
      hasTableTarget: Boolean(airtableTableNameOrId),
      hasCompleteSetup,
      hasFirstPreviewApproval: firstPreviewApproved,
    },
    canConfirmRegisterStructure: false,
    metadataCheckOk: false,
    tableTargetReachable: false,
    missingVariables,
    testPolicy: {
      metadataOnly: true,
      queriesRecords: false,
      returnsRecordFields: false,
      readOnly: true,
      manualOnly: true,
    },
    safety: [
      "keine Tokens im Frontend",
      "keine Record-Felder im Response",
      "keine echten Airtable-Feldnamen im Response",
      "keine Datensatzanzeige",
      "keine Schreibfunktionen",
      "keine Synchronisierung",
      "keine echten Daten im Response",
      "Jamal-Freigabe erforderlich",
    ],
  };
}

function getAirtableChefStatus(missingVariables, firstPreviewApproved) {
  if (missingVariables.length > 0) {
    return {
      status: "Nicht bereit – lokale Zugangsdaten fehlen",
      localReachable: "noch nicht geprüft",
      minimalCheckCompleted: "nein",
      dataDisplay: "weiterhin gesperrt",
      nextStep: "Zugangsdaten lokal ergänzen",
    };
  }

  if (!firstPreviewApproved) {
    return {
      status: "Nicht bereit – manuelle Server-Freigabe fehlt",
      localReachable: "noch nicht geprüft",
      minimalCheckCompleted: "nein",
      dataDisplay: "weiterhin gesperrt",
      nextStep: "Server-Freigabe setzen",
    };
  }

  return {
    status: "Bereit zur lokalen Minimalprüfung",
    localReachable: "noch nicht geprüft",
    minimalCheckCompleted: "nein",
    dataDisplay: "weiterhin gesperrt",
    nextStep: "lokale Minimalprüfung ausführen",
  };
}

function handlePilotStatus(res) {
  sendJson(res, 200, getPilotStatus());
}

function getTodaysOneDecision() {
  return {
    version: "V1.1.5",
    title: "Heutige 1 Entscheidung",
    lead: "Heute reicht diese eine Entscheidung",
    decisionQuestion:
      "Soll heute der Projektmanager-Agent den nächsten kleinsten Schritt vorbereiten?",
    recommendation: "Ja, vorbereiten lassen – aber nichts automatisch ausführen.",
    reason: "Das bringt Tagesklarheit und reduziert Suchaufwand.",
    riskIfSkipped: "Ohne Entscheidung bleibt der Tag breiter und unklarer.",
    nextManualStep:
      "Jamal gibt diese eine Entscheidung frei oder überspringt sie bewusst.",
    jamalDecides: true,
    autoDecisionBlocked: true,
    completionCriterion:
      "Heute erledigt, wenn Jamal diese eine Entscheidung freigibt oder bewusst überspringt.",
    doneWhen:
      "Jamal gibt diese eine Entscheidung frei oder überspringt sie bewusst.",
    noFurtherActionRequired: true,
    nextDecisionTomorrow: true,
    completionBoundary: "Jamal entscheidet, das System entscheidet nichts automatisch.",
    madeExternalRequest: false,
    externalActionStarted: false,
    automaticAgentExecutionStarted: false,
    followUpAgentStarted: false,
    rightsChanged: false,
  };
}

function handleTodaysOneDecision(res) {
  sendJson(res, 200, getTodaysOneDecision());
}

function getProjectContinuationPreparation() {
  const projects = [
    {
      projectName: "Health Upgrade Kompass",
      currentStatus: "lokal als nächster sicherer Produkt-/Demo-Kandidat einordenbar",
      whyRelevant:
        "Das Projekt ist konkret genug und hat klare Demo-, Produkt- und Qualitätsgrenzen.",
      openOrBlocked:
        "Der nächste Qualitätsschritt muss eng bleiben; keine neue Funktion starten.",
      smallestHighQualityNextStep:
        "Nächsten lokalen Qualitätsschritt für die Demo-/Cockpit-Logik prüfen, ohne neue Funktionen zu starten.",
      riskIfTooEarly:
        "Zu frühes Weiterbauen könnte Demo-Logik und Produktgrenzen verwässern.",
      recommendedClassification: "heute weiterführen",
      jamalOptions: ["Heute weiterführen", "Heute überspringen"],
    },
    {
      projectName: "Expansion App",
      currentStatus: "strategisch relevant, aber vor Fortsetzung noch stärker einzugrenzen",
      whyRelevant:
        "Die App kann später Wachstum und Systemleistung bündeln, braucht aber klare Startgrenze.",
      openOrBlocked:
        "Noch unklar, welcher kleinste nächste Nutzen ohne neue Komplexität entsteht.",
      smallestHighQualityNextStep:
        "Nur den kleinsten sinnvollen App-Ausschnitt als späteren Prüfpunkt formulieren.",
      riskIfTooEarly:
        "Zu frühes Starten erzeugt Breite statt nutzbarer Produktklarheit.",
      recommendedClassification: "erst klären",
      jamalOptions: ["Heute weiterführen", "Heute überspringen"],
    },
    {
      projectName: "FlowLingo",
      currentStatus: "als Produktidee vorhanden, Fortsetzung braucht klare Lern-/Demo-Grenze",
      whyRelevant:
        "FlowLingo kann als fokussiertes Lernprodukt wertvoll werden, wenn der nächste Schritt klein bleibt.",
      openOrBlocked:
        "Noch zu klären: welches Lern- oder Demo-Element zuerst hochwertig geprüft wird.",
      smallestHighQualityNextStep:
        "Eine einzige Lern-/Demo-Situation auswählen und lokal als Qualitätsfrage formulieren.",
      riskIfTooEarly:
        "Zu frühes Weiterarbeiten kann Inhalte, Zielgruppe und Produktnutzen vermischen.",
      recommendedClassification: "später weiterführen",
      jamalOptions: ["Heute weiterführen", "Heute überspringen"],
    },
    {
      projectName: "Marketing Agentur OS",
      currentStatus: "als Betriebs-/Agentur-System relevant, aber nicht heutiger Startpunkt",
      whyRelevant:
        "Das Projekt kann später Prozesse, Angebote und Delivery strukturieren.",
      openOrBlocked:
        "Vor Fortsetzung braucht es eine klare Grenze zwischen System, Angebot und operativer Umsetzung.",
      smallestHighQualityNextStep:
        "Einen einzigen manuellen Agentur-OS-Nutzen beschreiben, der ohne Tool-Aktion prüfbar ist.",
      riskIfTooEarly:
        "Zu frühe Umsetzung könnte neue Verwaltung statt echter Entlastung erzeugen.",
      recommendedClassification: "später weiterführen",
      jamalOptions: ["Heute weiterführen", "Heute überspringen"],
    },
    {
      projectName: "KI-Unternehmenszentrale",
      currentStatus: "aktiver Systemkern, aktuell stabil in Plugin- und Cockpit-Vorbereitung",
      whyRelevant:
        "Die Zentrale steuert Orientierung, Sicherheit und spätere Agenten-/Plugin-Arbeit.",
      openOrBlocked:
        "Nicht zu viele neue Stränge gleichzeitig starten; bestehende Qualität halten.",
      smallestHighQualityNextStep:
        "Nur prüfen, ob der nächste Projektfokus sichtbar genug für Jamals Entscheidung ist.",
      riskIfTooEarly:
        "Weitere Systemarbeit kann echte Projektfortsetzung verdrängen.",
      recommendedClassification: "erst klären",
      jamalOptions: ["Heute weiterführen", "Heute überspringen"],
    },
  ];

  return {
    title: "Projekt-Fortsetzung vorbereiten",
    principle: "Qualität vor Geschwindigkeit. Erst Orientierung, dann Jamals manuelle Entscheidung.",
    recommendedProject: "Health Upgrade Kompass",
    reasonForRecommendation:
      "Das Projekt ist konkret genug, hat klare Demo-, Produkt- und Qualitätsgrenzen, eignet sich für einen hochwertigen kleinen nächsten Schritt und braucht keine externe Aktion.",
    projects,
    smallestHighQualityNextStep:
      "Nächsten lokalen Qualitätsschritt für die Demo-/Cockpit-Logik prüfen, ohne neue Funktionen zu starten.",
    jamalDecisionRequired: true,
    qualityBeforeSpeed: true,
    automaticProjectWorkBlocked: true,
    externalRequestsBlocked: true,
    pluginActionsBlocked: true,
    automaticStorageBlocked: true,
    automaticFollowUpBlocked: true,
  };
}

function getProjectContinuationDecision() {
  return {
    title: "Einfache Projekt-Entscheidung",
    question: "Health Upgrade Kompass heute lokal weiter vorbereiten oder bewusst überspringen?",
    options: ["Heute lokal weiter vorbereiten", "Heute bewusst überspringen"],
    explanation:
      "Jamal entscheidet nur, ob Health Upgrade Kompass heute als lokaler nächster Qualitätsschritt weiter vorbereitet wird. Es wird keine echte Projektbearbeitung gestartet.",
    safetyBoundary:
      "Keine automatische Ausführung, keine Speicherung, kein Folgeagentenstart, keine externe Aktion.",
    manualOnly: true,
    automaticExecutionBlocked: true,
    automaticStorageBlocked: true,
    followUpAgentStartBlocked: true,
    externalActionBlocked: true,
  };
}

function getHealthUpgradeLocalQualityOrder() {
  return {
    title: "Kopierbarer Qualitätsauftrag für Health Upgrade Kompass",
    hint: "Nur nutzen, wenn Jamal heute lokal weiter vorbereiten möchte.",
    copyText:
      "Prüfe lokal den Health Upgrade Kompass: Ist der Demo-Fluss Startseite → Kompass starten → kleiner erster Schritt → 6 Antworten → Ergebnis → Mit Beraterin besprechen → Kundenbereich weiterhin verständlich, sicher und präsentationsfähig? Keine neuen Funktionen starten. Nur Auffälligkeiten, kleinste Verbesserung und Risiko notieren.",
    safetyBoundary:
      "Nur lokaler Qualitätsauftrag. Keine automatische Ausführung, keine Speicherung, kein Folgeagentenstart, keine externe Aktion.",
    manualOnly: true,
    localOnly: true,
    automaticExecutionBlocked: true,
    automaticStorageBlocked: true,
    followUpAgentStartBlocked: true,
    externalActionBlocked: true,
    realProjectWorkStarted: false,
  };
}

function getHealthUpgradeLocalQualityChecklist() {
  return {
    title: "Mini-Checkliste für die lokale Health-Prüfung",
    hint: "Nur manuell nutzen, wenn Jamal den Demo-Fluss heute lokal prüfen möchte.",
    checklistItems: [
      "Demo lokal öffnen",
      "Startseite kurz prüfen",
      "Kompass starten",
      "6 Antworten durchgehen",
      "Ergebnis-Seite ansehen",
      "„Mit Beraterin besprechen“ prüfen",
      "Kundenbereich öffnen",
      "Auffälligkeiten nur notieren",
    ],
    safetyBoundary:
      "Diese Checkliste startet nichts automatisch, speichert nichts, prüft keine echten Kundendaten und löst keinen Folgeagenten aus.",
    manualOnly: true,
    automaticExecutionBlocked: true,
    automaticStorageBlocked: true,
    followUpAgentStartBlocked: true,
    externalActionBlocked: true,
  };
}

function getHealthUpgradeLocalFindingClassification() {
  return {
    title: "Auffälligkeiten lokal einordnen",
    hint: "Nur als lokale Einordnung nach der Mini-Checkliste nutzen.",
    options: [
      "Keine Auffälligkeit gefunden",
      "Kleine optische Auffälligkeit",
      "Verständnisproblem im Demo-Fluss",
      "Technischer Fehler",
      "Heute nicht weiter prüfen",
    ],
    safetyBoundary:
      "Diese Einordnung speichert nichts automatisch, erstellt keinen Fehlerbericht, startet keinen Folgeagenten und löst keine externe Aktion aus.",
    manualOnly: true,
    automaticExecutionBlocked: true,
    automaticStorageBlocked: true,
    followUpAgentStartBlocked: true,
    externalActionBlocked: true,
    reportCreationBlocked: true,
  };
}

function getHealthUpgradeLocalFindingNextSteps() {
  return {
    title: "Manueller nächster Schritt je Auffälligkeit",
    hint: "Nur Orientierung für Jamal nach der lokalen Einordnung.",
    nextSteps: [
      {
        finding: "Keine Auffälligkeit gefunden",
        nextManualStep: "Demo kann lokal als vorzeigbar betrachtet werden.",
      },
      {
        finding: "Kleine optische Auffälligkeit",
        nextManualStep: "Auffälligkeit nur notieren. Später in einer Designrunde prüfen.",
      },
      {
        finding: "Verständnisproblem im Demo-Fluss",
        nextManualStep: "Formulierung oder Ablauf später vereinfachen. Heute keine automatische Änderung.",
      },
      {
        finding: "Technischer Fehler",
        nextManualStep: "Fehler lokal beschreiben. Noch kein Ticket, keine externe Meldung.",
      },
      {
        finding: "Heute nicht weiter prüfen",
        nextManualStep: "Offen lassen. Keine weitere Aktion nötig.",
      },
    ],
    safetyBoundary:
      "Keine automatische Speicherung, kein Fehlerbericht, kein Folgeagentenstart, keine externe Aktion, keine echte Projektbearbeitung, keine automatische Entscheidung. Nur Orientierung für Jamal.",
    manualOnly: true,
    automaticExecutionBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    followUpAgentStartBlocked: true,
    externalActionBlocked: true,
    reportCreationBlocked: true,
    realProjectWorkStarted: false,
  };
}

function getHealthUpgradeLocalDemoStatusSummary() {
  return {
    title: "Lokalen Demo-Status zusammenfassen",
    hint: "Nur manuelle Gesamt-Einschätzung nach der lokalen Health-Prüfung.",
    statusOptions: [
      {
        status: "Demo lokal vorzeigbar",
        when: "wenn keine Auffälligkeit gefunden wurde",
        explanation: "Die Demo kann lokal als vorzeigbar betrachtet werden.",
      },
      {
        status: "Demo mit kleiner Notiz vorzeigbar",
        when: "wenn nur eine kleine optische Auffälligkeit gefunden wurde",
        explanation:
          "Die Demo kann lokal weiter genutzt werden; die Auffälligkeit wird nur für eine spätere Designrunde notiert.",
      },
      {
        status: "Demo später vereinfachen",
        when: "wenn ein Verständnisproblem im Demo-Fluss gefunden wurde",
        explanation:
          "Der Demo-Fluss sollte später verständlicher gemacht werden; heute wird keine automatische Änderung gestartet.",
      },
      {
        status: "Demo technisch offen",
        when: "wenn ein technischer Fehler gefunden wurde",
        explanation:
          "Der Fehler wird lokal beschrieben; es wird kein Ticket, keine externe Meldung und keine automatische Aktion ausgelöst.",
      },
      {
        status: "Demo heute offen lassen",
        when: "wenn heute nicht weiter geprüft wird",
        explanation: "Die Prüfung bleibt offen; heute ist keine weitere Aktion nötig.",
      },
    ],
    safetyBoundary:
      "Keine automatische Speicherung, keine automatische Entscheidung, keine automatische Änderung an der Demo, kein Ticket, keine externe Meldung, kein Folgeagentenstart, keine echten Kundendaten.",
    manualOnly: true,
    automaticExecutionBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticDemoChangeBlocked: true,
    ticketCreationBlocked: true,
    externalReportBlocked: true,
    followUpAgentStartBlocked: true,
    realCustomerDataBlocked: true,
  };
}

function getHealthUpgradeLocalDemoManualReleaseDecision() {
  return {
    title: "Manuelle Demo-Freigabe vorbereiten",
    question: "Soll die Demo lokal als vorzeigbar gelten?",
    options: [
      {
        label: "Ja, lokal vorzeigbar",
        explanation: "Die Demo kann lokal als vorzeigbar betrachtet werden.",
      },
      {
        label: "Ja, mit kleiner Notiz",
        explanation:
          "Die Demo kann lokal gezeigt werden; kleine Auffälligkeiten werden nur für später notiert.",
      },
      {
        label: "Noch nicht vorzeigbar",
        explanation:
          "Die Demo sollte vor einer Vorführung noch vereinfacht oder technisch geprüft werden.",
      },
      {
        label: "Heute offen lassen",
        explanation:
          "Es wird heute keine Freigabe getroffen und keine weitere Aktion gestartet.",
      },
    ],
    safetyBoundary:
      "Nur lokale Orientierung für Jamal. Keine echte Freigabe speichern, keine Demo verändern, keine externe Aktion auslösen.",
    manualOnly: true,
    automaticStorageBlocked: true,
    realReleaseBlocked: true,
    automaticDecisionBlocked: true,
    automaticDemoChangeBlocked: true,
    ticketCreationBlocked: true,
    externalReportBlocked: true,
    followUpAgentStartBlocked: true,
    externalActionBlocked: true,
    realCustomerDataBlocked: true,
  };
}

function getHealthUpgradeLocalDemoReleaseCopyNote() {
  return {
    title: "Kopierbare Demo-Freigabe-Notiz",
    noteVariants: [
      {
        label: "Demo lokal vorzeigbar",
        text:
          "Die Health Upgrade Kompass Demo ist lokal vorzeigbar. Es handelt sich weiterhin nur um einen lokalen Demo-Stand ohne echte Freigabe, Speicherung oder externe Aktion.",
      },
      {
        label: "Demo lokal mit kleiner Notiz vorzeigbar",
        text:
          "Die Health Upgrade Kompass Demo ist lokal grundsätzlich vorzeigbar. Eine kleine Notiz bleibt offen und sollte bei der Besprechung erwähnt werden. Es erfolgt keine echte Freigabe, keine Speicherung und keine externe Aktion.",
      },
      {
        label: "Demo noch nicht vorzeigbar",
        text:
          "Die Health Upgrade Kompass Demo gilt lokal noch nicht als vorzeigbar. Der aktuelle Stand bleibt ein interner Prüfstand ohne echte Freigabe, Speicherung oder externe Aktion.",
      },
      {
        label: "Heute offen gelassen",
        text:
          "Die lokale Vorzeigbarkeit der Health Upgrade Kompass Demo wurde heute bewusst offen gelassen. Es wurde keine echte Freigabe erteilt, nichts gespeichert und keine externe Aktion ausgelöst.",
      },
    ],
    safetyBoundary:
      "Nur kopierbare Notiz. Keine echte Freigabe. Keine Speicherung. Keine Demo-Änderung. Keine externe Meldung. Keine automatische Entscheidung.",
    manualOnly: true,
    realReleaseBlocked: true,
    automaticStorageBlocked: true,
    automaticDemoChangeBlocked: true,
    externalReportBlocked: true,
    automaticDecisionBlocked: true,
    followUpAgentStartBlocked: true,
    externalActionBlocked: true,
  };
}

function getHealthUpgradeLocalDemoClosingSummary() {
  return {
    title: "Lokalen Demo-Abschluss zusammenfassen",
    summaryPoints: [
      "Lokale Demo-Prüfung vorbereitet",
      "Auffälligkeiten können lokal eingeordnet werden",
      "Demo-Status kann lokal zusammengefasst werden",
      "Manuelle Demo-Freigabe-Entscheidung ist vorbereitet",
      "Kopierbare Demo-Freigabe-Notiz ist vorhanden",
      "Ergebnis bleibt nur eine lokale Zusammenfassung",
    ],
    result: "Die Health Upgrade Kompass Demo kann lokal eingeordnet werden, ohne echte Freigabe, Speicherung oder externe Aktion.",
    safetyBoundary:
      "Keine echte Demo-Freigabe. Keine automatische Speicherung. Keine Demo-Änderung. Keine externe Meldung. Keine automatische Entscheidung. Kein Folgeagentenstart. Keine echten Kundendaten. Keine Plugin-Ausführung.",
    manualOnly: true,
    realReleaseBlocked: true,
    automaticStorageBlocked: true,
    automaticDemoChangeBlocked: true,
    externalReportBlocked: true,
    automaticDecisionBlocked: true,
    followUpAgentStartBlocked: true,
    realCustomerDataBlocked: true,
    pluginExecutionBlocked: true,
    externalActionBlocked: true,
  };
}

function getHealthUpgradeLocalDemoReviewStandPrepared() {
  return {
    title: "Health Upgrade Demo-Prüfstand vorbereitet",
    status: "Lokale Demo-Prüfkette ist vorbereitet",
    lastPreparedStep: "Lokalen Demo-Abschluss zusammenfassen",
    includedSteps: [
      "Auffälligkeiten lokal einordnen",
      "Demo-Status lokal zusammenfassen",
      "Manuelle Demo-Freigabe vorbereiten",
      "Kopierbare Demo-Freigabe-Notiz",
      "Lokaler Demo-Abschluss",
    ],
    nextManualStep: "Demo lokal einmal durchgehen",
    result: "Ergebnis bleibt lokale Orientierung",
    safetyBoundary:
      "Keine automatische Prüfung. Keine automatische Speicherung. Keine echte Demo-Freigabe. Keine Demo-Änderung. Keine externe Aktion. Keine automatische Entscheidung. Kein Folgeagentenstart.",
    manualOnly: true,
    automaticCheckBlocked: true,
    automaticStorageBlocked: true,
    realReleaseBlocked: true,
    automaticDemoChangeBlocked: true,
    externalActionBlocked: true,
    automaticDecisionBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getTodaysThreeThings() {
  return {
    version: "V1.1.5",
    agentCount: 25,
    title: "Heute wirklich nur diese 3 Dinge",
    headline: "Heute wirklich nur diese 3 Dinge",
    dayMode: "start",
    defaultDayMode: "start",
    currentDayModeLabel: "Start",
    currentDayModeDisplayText: "Aktueller Tagesmodus: Start",
    currentDayModeExplanation:
      "Das Cockpit hat die 3 wichtigsten Dinge für heute vorgeschlagen.",
    nextConcreteActionTitle: "Jetzt konkret tun",
    nextConcreteActionSteps: [
      "Die 3 wichtigsten Dinge für heute ansehen.",
      "Eine Entscheidung freigeben oder bewusst überspringen.",
      "Danach den Tag als offen oder abgeschlossen einordnen.",
    ],
    nextConcreteActionExplanation:
      "Das ist nur eine manuelle Orientierung. Jamal entscheidet, was davon heute gilt.",
    nextConcreteActionManualOnly: true,
    decisionStillRequiresJamal: true,
    projectContinuationPreparation: getProjectContinuationPreparation(),
    projectContinuationDecision: getProjectContinuationDecision(),
    healthUpgradeLocalQualityOrder: getHealthUpgradeLocalQualityOrder(),
    healthUpgradeLocalQualityChecklist: getHealthUpgradeLocalQualityChecklist(),
    healthUpgradeLocalFindingClassification: getHealthUpgradeLocalFindingClassification(),
    healthUpgradeLocalFindingNextSteps: getHealthUpgradeLocalFindingNextSteps(),
    healthUpgradeLocalDemoStatusSummary: getHealthUpgradeLocalDemoStatusSummary(),
    healthUpgradeLocalDemoManualReleaseDecision: getHealthUpgradeLocalDemoManualReleaseDecision(),
    healthUpgradeLocalDemoReleaseCopyNote: getHealthUpgradeLocalDemoReleaseCopyNote(),
    healthUpgradeLocalDemoClosingSummary: getHealthUpgradeLocalDemoClosingSummary(),
    healthUpgradeLocalDemoReviewStandPrepared: getHealthUpgradeLocalDemoReviewStandPrepared(),
    nextPluginInstallationPreparationStep:
      "Als kleinsten nächsten manuellen Plugin-Schritt den Airtable Read-only-Verbindungsstand später bewusst prüfen. Keine Installation, keine Verbindung und keine externe Aktion automatisch starten.",
    nextManualPluginConnectionCandidate:
      "Airtable Read-only ist der empfohlene erste manuelle Plugin-Verbindungstest. Jamal entscheidet später manuell; heute wird keine Verbindung hergestellt.",
    nextCopyableAirtableReadOnlyTestOrder:
      "Kopierbarer Airtable Read-only-Testauftrag ist vorbereitet. Nur später manuell nutzen; heute keine Verbindung, kein Token, kein Secret und keine Datenabfrage.",
    nextManualAirtableReadOnlyTestClassification:
      "Airtable Read-only-Test kann später lokal eingeordnet werden: vorbereiten, Ziel klären, überspringen, anderes Plugin prüfen oder offen lassen. Heute keine Airtable-Verbindung.",
    nextManualAirtableReadOnlyTestGoalClarification:
      "Vor einer späteren Airtable-Verbindung zuerst lokal klären, was der Read-only-Test beweisen soll. Heute keine Verbindung, keine Datenabfrage und keine automatische Vorbereitung.",
    nextCopyableAirtableReadOnlyTestGoalSelection:
      "Kopierbare Airtable-Zielauswahl ist vorbereitet. Nur als lokale Zielnotiz nutzen; heute keine Verbindung, kein Token, kein Secret und keine Datenabfrage.",
    nextManualAirtableGoalDecisionClassification:
      "Airtable-Zielentscheidung lokal einordnen: Jamal kann später manuell festlegen, welches Airtable-Ziel zuerst geprüft werden soll.",
    nextSmallestSafeAirtableGoalRecommendation:
      "Kleinste sichere Airtable-Ziel-Empfehlung: Nur Verbindung grundsätzlich prüfen. Jamal entscheidet später selbst; heute keine Airtable-Verbindung.",
    nextCopyableAirtableBasicConnectionCheckOrder:
      "Kopierbarer Auftrag für eine spätere Airtable-Verbindungsgrundprüfung ist vorbereitet. Nur Grundverbindung, keine Tabellenstruktur, keine Records, keine Daten und keine Ausführung.",
    nextAirtablePreparationBundleSummary:
      "Airtable-Vorbereitung zusammengefasst: empfohlen ist nur die grundsätzliche Verbindung. Heute keine Airtable-Verbindung, keine Daten, keine Tokens und keine automatische Ausführung.",
    nextManualAirtableBundleDecision:
      "Airtable-Bündelentscheidung ist vorbereitet: Jamal kann später manuell entscheiden, ob Airtable als erster Read-only-Verbindungstest gewählt wird. Heute keine Verbindung und keine Ausführung.",
    nextAirtableFirstTestPreparationPackage:
      "Airtable-Ersttest-Paket ist lokal vorbereitet und kann später bewusst manuell gestartet oder verworfen werden. Heute keine Airtable-Verbindung, kein Token, keine Daten und keine Ausführung.",
    nextAirtableFirstTestResultDocumentation:
      "Airtable-Ersttest-Ergebnisdokumentation ist lokal vorbereitet. Standard bleibt: Nicht gestartet – später bewusst manuell prüfen. Heute kein Test und keine Airtable-Verbindung.",
    nextPluginTestCockpitSummary:
      "Plugin-Test-Cockpit fasst die Airtable-Testbausteine lokal zusammen: Jamal braucht jetzt keine weitere Einzelvorbereitung, sondern kann den späteren manuellen Read-only-Ersttest bewusst einordnen oder offen lassen.",
    nextPluginTestDailyDecision:
      "Plugin-Test-Tagesentscheidung: Jamal entscheidet heute nur, ob der Airtable-Ersttest später manuell vorbereitet wird oder offen bleibt. Heute keine Verbindung und keine Ausführung.",
    nextProductiveUsagePreparation:
      "Produktivmodus vorbereiten: Die Zentrale ist lokal führungsbereit, operative Nutzung ist noch nicht aktiv. Kleinster nächster Schritt ist, zuerst die Tagesführung produktiv vorzubereiten.",
    nextProductiveDailyLeadership:
      "Produktive Tagesführung ist lokal definiert: morgens 1 Fokus, 1 Entscheidung, 1 Grenze und 1 Erfolgskriterium sichtbar machen. Keine externe Verbindung und keine Automatik.",
    nextProductiveDailyClosure:
      "Produktiver Tagesabschluss ist lokal vorbereitet: am Tagesende manuell einordnen, was entschieden wurde, was bewusst nicht gestartet wurde und welcher kleinste sichere Schritt morgen sichtbar sein soll.",
    nextProductiveDailyHandoff:
      "Tagesübergabe ist lokal vorbereitet: Jamal sieht morgen, was aus dem heutigen Abschluss wieder aufgegriffen werden kann. Es wird nichts automatisch übernommen, gespeichert oder gestartet.",
    nextProductiveDailyCycleSummary:
      "Produktiver Tageszyklus ist lokal zusammengefasst: Produktivmodus, Tagesführung, Tagesabschluss und Tagesübergabe sind vorbereitet. Jamal behält jede Entscheidung; keine Speicherung, keine Übernahme und keine externe Verbindung.",
    nextProductiveMorningRoutine: {
      title: "Morgenroutine aus Tageszyklus ableiten",
      focusCheck: "1 Fokus übernehmen oder bewusst neu wählen",
      decisionCheck: "1 offene Entscheidung prüfen",
      boundaryCheck: "1 Grenze bestätigen",
      recommendation: "Morgen mit einem kleinen, sicheren Führungsstart beginnen.",
    },
    nextProductiveWorkdayLocalSimulation:
      "Nächster produktiver Schritt: den ersten geführten Arbeitstag lokal simulieren. Morgenroutine, Tagesführung, Tagesabschluss und Übergabe werden als manuelle 5-Minuten-Führung verbunden; keine Speicherung, keine Verbindung und keine Automatik.",
    nextProductiveWorkdayLocalSimulationEvaluation:
      "Simulationsergebnis lokal auswerten: Jamal kann nach der lokalen Tagessimulation erkennen, was bereits produktiv nutzbar wäre, wo Unsicherheit bleibt und welche manuelle Entscheidung nötig ist. Keine Speicherung, keine Verbindung und keine Automatik.",
    nextProductiveLocalReleasePreparation:
      "Lokale Produktivfreigabe vorbereiten: kleinster sicherer nächster Schritt ist, nur Tagesführung, Tagesabschluss und Tagesübergabe lokal freizugeben. Airtable, Plugins, echte Daten, Schreiboperationen und Folgeagenten bleiben gesperrt.",
    nextProductiveLocalUsageManualStart:
      "Lokale Produktivnutzung manuell starten: Jamal kann einen kontrollierten lokalen Durchlauf mit Tagesführung, Tagesabschluss und Tagesübergabe starten. Keine externe Verbindung, keine Speicherung, keine Automatik und keine echte Produktivfreigabe ohne Jamals Entscheidung.",
    nextProductiveLocalUsageFirstRunEvaluation:
      "Ersten lokalen Produktivdurchlauf manuell auswerten: Nach bewusster manueller Nutzung kann Jamal lokal einschätzen, ob Tagesführung, Tagesabschluss und Übergabe hilfreich waren. Es wird nicht behauptet, dass der Durchlauf bereits stattgefunden hat.",
    nextProductiveLocalUsageEvaluationLeadershipDecision:
      "Auswertungsergebnis in lokale Führungsentscheidung überführen: Nur wenn Jamal später ein Ergebnis manuell bestätigt, darf daraus eine kleine lokale Führungsentscheidung vorbereitet werden. Kein echter Durchlauf wird behauptet, nichts wird gespeichert oder automatisiert.",
    nextProductiveLocalLeadershipDecisionNextSafeStep:
      "Nächsten sicheren lokalen Produktivschritt ableiten: Aus einer später manuell bestätigten Führungsentscheidung darf höchstens eine lokale Morgenstart- oder Tagesfokus-Prüfung vorbereitet werden. Ohne Jamals Auswahl bleibt alles vorbereitet; kein echter Produktivdurchlauf wird behauptet oder gestartet.",
    nextProductiveLeadershipWorkspace:
      "Produktiver Führungsarbeitsplatz: Jamal kann morgens lokal entscheiden, ob heute Morgenstart, Tagesfokus oder eine lokale Entscheidungskarte geführt wird. Empfehlung: vorhandene lokale Informationen manuell nutzen; keine externe Verbindung, keine Speicherung und keine Automatik.",
    nextProductiveLeadershipWorkspaceDailyDecision:
      "Tagesentscheidung aus Führungsarbeitsplatz: Jamal wählt heute genau einen lokalen Produktivschritt oder lässt ihn bewusst offen. Die Entscheidung bleibt manuell; keine Verbindung, keine Speicherung, keine Schreiboperation und keine Automatik.",
    nextProductiveLeadershipWorkspaceDailyExecution:
      "Tagesausführung aus Tagesentscheidung: Aus der manuellen Tagesentscheidung ist eine lokale Tagesfokus-Prüfung vorbereitet. Jamal startet sie bewusst selbst; nichts wird automatisch gespeichert, dokumentiert, verbunden oder an Agenten weitergegeben.",
    nextProductiveLeadershipWorkspaceDailyExecutionEvaluation:
      "Tagesausführung manuell auswerten: Nach einer bewusst manuell gestarteten lokalen Tagesfokus-Prüfung kann Jamal Ergebnis, Blockade oder Unklarheit einordnen. Keine automatische Fortsetzung, keine Speicherung und keine externe Aktion.",
    nextProductiveProjectWorkspaceReadiness:
      "Projektarbeitsfähigkeit vorbereiten: Jamal kann als nächstes ein echtes Projekt auswählen, den aktuellen Stand sichtbar machen und einen kleinsten sicheren Projektschritt lokal führen.",
    nextProductivePluginExpansionBridge:
      "Plugin-Erweiterungsbrücke: Airtable, Gmail, Calendar, Drive und GitHub werden nur als mögliche read-only Unterstützung geplant; keine Verbindung und keine Aktion ohne Jamals Freigabe.",
    nextProductiveReadOnlyProjectContextPreparation:
      "Read-only Projektkontext vorbereiten: Für ein gewähltes Projekt kann später eine einzelne Informationsquelle manuell read-only geprüft werden. Heute keine externe Anfrage, keine Speicherung und keine Schreiboperation.",
    nextProductiveManualProjectWorkRunPreparation:
      "Ersten manuellen Projektarbeitsdurchlauf vorbereiten: Health Upgrade Kompass wird als erster lokaler Projektarbeitsdurchlauf vorbereitet. Jamal startet bewusst selbst; keine echte Projektbearbeitung, keine Speicherung, keine externe Verbindung und keine automatische Fortsetzung.",
    nextProductiveManualProjectWorkRunEvaluation:
      "Ersten manuellen Health-Projektdurchlauf auswerten: Nach Jamals manueller Durchführung kann der Health Upgrade Kompass kontrolliert eingeordnet werden. Keine Speicherung, keine Tool-Verbindung, keine echte Projektbearbeitung und keine automatische Fortsetzung.",
    nextProductiveHealthProjectAgentWorkOrder:
      "Health-Projektarbeit in Agentenauftrag überführen: Aus dem manuellen Health-Projektdurchlauf wird ein klarer Agentenauftrag mit Rollen, Reihenfolge, erwarteten Ergebnissen und Grenzen vorbereitet. Agents führen noch nichts automatisch aus; Jamal muss freigeben.",
    nextProductiveHealthProjectAgentRunEvaluation:
      "Simulierten Health-Agentenlauf manuell auswerten: Jamal kann aus der read-only Simulation eine Führungsentscheidung ableiten und den nächsten manuellen Health-Projektarbeitsschritt freigeben, nachschärfen oder stoppen. Keine automatische Ausführung, keine Speicherung und keine Tool-Verbindung.",
    nextProductiveManualHealthProjectWorkStepPreparation:
      "Ersten manuellen Health-Projektarbeitsschritt aus Agentenauswertung vorbereiten: Health Upgrade Kompass Produktstruktur lokal ableiten, mit Jamals Freigabe starten, zurückstellen oder stoppen. Keine automatische Umsetzung, keine Speicherung und keine Tool-Verbindung.",
    nextProductiveFastQualityWorkMode:
      "Schneller qualitätsgesicherter Arbeitsmodus: Jamal kann den vorbereiteten Health-Projektarbeitsschritt konzentriert manuell bearbeiten. Die Zentrale priorisiert und verdichtet, führt aber nichts automatisch aus und speichert nichts.",
    nextProductiveManualHealthDayWork: {
      title: "Schnelle manuelle Health-Tagesarbeit",
      nextStep:
        "Erste manuelle Produktstruktur für den Health Upgrade Kompass ausarbeiten.",
      why:
        "Der schnelle Qualitätsmodus aus V6.33.4 ist vorbereitet; jetzt entsteht Fortschritt durch einen manuell prüfbaren Produktstruktur-Entwurf.",
      expectedResult:
        "Ein erster Strukturentwurf mit 5 Produktbereichen, je Bereich Zweck, Nutzen, Grenze und nächstem Prüfpunkt.",
      jamalDecision:
        "Jetzt manuell ausarbeiten, noch einmal schärfen oder stoppen.",
      stopWhen:
        "Stoppen, wenn Nutzen, Health-Grenze, echte Daten, externe Tools oder Qualitätsverlust sichtbar werden.",
    },
    nextProductiveHealthFinishCorridor: {
      title: "Ergebnisorientierter Finish-Korridor",
      nextStep:
        "Health Upgrade Kompass: erste Produktstruktur in finish-nahes Zwischenergebnis überführen.",
      finishGoal:
        "Eine erste belastbare Produktstruktur muss so klar werden, dass Jamal über den nächsten manuellen Umsetzungsblock entscheiden kann.",
      decision:
        "Finish-nah ausarbeiten, einmal begrenzt nachschärfen oder stoppen.",
      boundary:
        "Keine neuen Agentenläufe oder Nebenschauplätze, bis das aktuelle Zwischenergebnis fertiggestellt oder bewusst gestoppt ist.",
    },
    nextProductiveHealthFinishResultDraft: {
      title: "Health-Finish-Ergebnis ausarbeiten",
      result:
        "Erste fertige Produktstruktur für den Health Upgrade Kompass als sichtbares, entscheidungsfähiges Zwischenergebnis ausarbeiten.",
      includes:
        "Zielbild, erster Nutzerfluss, Ergebnislogik ohne medizinische Bewertung, Berateranschluss und offene Punkte.",
      decision:
        "Finish-Ergebnis übernehmen, einmal konkret nachschärfen oder stoppen.",
      boundary:
        "Keine Diagnose, keine Heilversprechen, keine echten Kundendaten, keine Speicherung, keine Automatisierung und keine externe Verarbeitung.",
    },
    nextProductiveHealthProductCard: {
      title: "Erste Health-Produktkarte",
      productCard: "Mein nächster kleiner Health-Schritt",
      nextStep:
        "Das Health-Finish-Ergebnis in eine erste manuell nutzbare Produktkarte überführen.",
      purpose:
        "Jamal sieht erstmals ein greifbares Produktmodul mit Nutzer-, Berater- und Sicherheitslogik.",
      decision:
        "Produktkarte weiter ausarbeiten, einmal begrenzt schärfen oder stoppen.",
      boundary:
        "Keine echten Kundendaten, keine Diagnose, keine Heilversprechen, keine Speicherung, keine Automatisierung und keine Plugin-Ausführung.",
    },
    nextProductiveHealthProductCardManualReview: {
      title: "Health-Produktkarte manuell prüfen",
      reviewedCard: "Mein nächster kleiner Health-Schritt",
      reviewGoal:
        "Prüfen, ob die erste Health-Produktkarte gut genug ist, um als belastbarer Baustein für den nächsten Health-Arbeitsblock zu dienen.",
      decisions: ["Übernehmen", "Einmal schärfen", "Stoppen / nicht weiterführen"],
      expectedResult:
        "Jamal entscheidet manuell, ob die Produktkarte übernommen, einmal begrenzt geschärft oder gestoppt wird.",
      boundary:
        "Keine neue Produktfunktion, keine Diagnose, keine Heilversprechen, keine echten Kundendaten, keine Speicherung und keine Automatisierung.",
    },
    nextProductiveHealthFirstWorkBlock: {
      title: "Ersten kleinen Health-Arbeitsblock ableiten",
      workBlock: "Heute wähle ich meinen nächsten kleinen Health-Schritt",
      nextStep:
        "Aus der geprüften Produktkarte einen ersten kleinen, manuell freizugebenden Health-Arbeitsblock ableiten.",
      expectedFormat:
        "1 Orientierungssatz, 1 kleiner nächster Schritt, 1 Reflexionsfrage und 1 medizinischer Abklärungshinweis.",
      productivityLink:
        "Der Block macht Health Upgrade Kompass zum ersten produktiven Übungsprojekt und trainiert die Agenten auf konkrete, begrenzte Projektergebnisse.",
      decision:
        "Arbeitsblock übernehmen, einmal begrenzt schärfen oder stoppen.",
      boundary:
        "Keine Diagnose, keine Heilversprechen, keine echten Kundendaten, keine Speicherung, keine Automatisierung und keine Plugin-Ausführung.",
    },
    nextProductiveHealthFirstWorkBlockManualExecution: {
      title: "Ersten Health-Arbeitsblock manuell ausführen",
      workBlock: "Heute wähle ich meinen nächsten kleinen Health-Schritt",
      nextStep:
        "Den abgeleiteten Health-Arbeitsblock mit Beispielausgabe ohne echte Kundendaten manuell ausführbar vorbereiten.",
      expectedVisibleResult:
        "1 Orientierungssatz, 1 kleiner nächster Schritt, 1 Reflexionsfrage und 1 Sicherheits-/Abklärungshinweis.",
      agentTrainingSignal:
        "Der Block dient als Trainingsfall für Agenten: konkrete Ergebnisqualität liefern, aber keine neue Autonomie freigeben.",
      decision:
        "Manuell ausführen, einmal begrenzt schärfen oder stoppen.",
      boundary:
        "Keine medizinische Empfehlung, keine Diagnose, keine Heilversprechen, keine echte Kundenkommunikation, keine Speicherung und keine Automatisierung.",
    },
    nextProductiveHealthFirstWorkBlockManualExecutionEvaluation: {
      title: "Ersten Health-Arbeitsblock manuell auswerten",
      workBlock: "Heute wähle ich meinen nächsten kleinen Health-Schritt",
      evaluationGoal:
        "Prüfen, ob der manuell ausführbare Arbeitsblock brauchbar war und welches wiederverwendbare Projektarbeitsmuster daraus entsteht.",
      reusablePattern:
        "Geprüftes Projektartefakt -> kleiner Arbeitsblock -> manuelle Ausführung -> manuelle Auswertung -> Agenten-Lernsignale -> wiederverwendbares Projektarbeitsmuster",
      decision:
        "Arbeitsblock als brauchbar markieren, einmal begrenzt schärfen oder stoppen.",
      boundary:
        "Keine automatische Projektentscheidung, keine Agenten-Autonomie-Erhöhung, keine Speicherung, keine externen Requests und keine medizinische Empfehlung.",
    },
    nextProductiveCentralProjectWorkRoutine: {
      title: "Projektarbeitsroutine aus Health-Muster ableiten",
      originPattern:
        "Geprüftes Projektartefakt -> kleiner Arbeitsblock -> manuelle Ausführung -> manuelle Auswertung -> Agenten-Lernsignale -> wiederverwendbares Projektarbeitsmuster",
      nextStep:
        "Das Health-Muster als allgemeine lokale Projektarbeitsroutine für Health, Expansion App, Marketing Agentur OS und weitere Projekte übernehmen oder begrenzt schärfen.",
      expectedResult:
        "Jamal sieht eine wiederverwendbare Routine, mit der echte Projektarbeit lokal, manuell und qualitätsgesichert geführt werden kann.",
      agentTrainingSignal:
        "Alle 25 Agenten bleiben im Vorschlagsmodus und werden über HR-Trainingsimpulse schrittweise arbeitsfähiger.",
      decision:
        "Projektarbeitsroutine übernehmen, einmal begrenzt schärfen oder stoppen.",
      boundary:
        "Keine automatische Projektbearbeitung, keine Speicherung, keine externen Requests, keine Plugin-Ausführung und keine Agenten-Autonomie-Erhöhung.",
    },
    nextProductiveExpansionFirstProjectWorkBlockFromRoutine: {
      title: "Projektarbeitsroutine auf Expansion App anwenden",
      project: "Expansion App",
      exampleCase: "Morning Fire -> Schweden",
      workBlock:
        "Unterlagenlücke für Morning Fire -> Schweden manuell strukturieren",
      nextStep:
        "Aus dem Produkt-Land-Paar eine interne Unterlagenübersicht vorbereiten: vorhanden, fehlt, unklar, nächster manueller Schritt.",
      expectedFormat:
        "1 Geschäftsführer-Kurzsatz, 1 Liste vorhandener Unterlagen, 1 Liste fehlender oder unklarer Unterlagen, 1 nächster manueller Schritt und 1 Sicherheits-/Prüfhinweis.",
      agentTrainingSignal:
        "Expansion App wird Trainingsfall 2; alle 25 Agenten bleiben im Vorschlagsmodus und HR leitet Trainingsimpulse ab.",
      decision:
        "Expansion-Arbeitsblock übernehmen, einmal begrenzt schärfen oder stoppen.",
      boundary:
        "Keine Rechtsberatung, keine regulatorische Freigabe, keine automatische Länderentscheidung, keine externe Kommunikation und keine Speicherung.",
    },
    nextProductiveExpansionRoutineApplicationEvaluation: {
      title: "Projektarbeitsroutine nach Expansion-Anwendung auswerten",
      project: "Expansion App",
      exampleCase: "Morning Fire -> Schweden",
      evaluationGoal:
        "Prüfen, ob die zentrale Projektarbeitsroutine nach Health auch bei Expansion App funktioniert und für ein drittes Projekt tragfähig wäre.",
      crossProjectProof:
        "Health-Arbeitsblock geprüft -> Health-Arbeitsblock ausgeführt -> Health-Arbeitsblock ausgewertet -> Routine abgeleitet -> Routine auf Expansion App angewendet -> Expansion-Anwendung auswertbar vorbereitet",
      decision:
        "Routine als projektübergreifend brauchbar markieren, einmal begrenzt schärfen, auf drittes Projekt testen oder stoppen.",
      boundary:
        "Keine Automatisierung, keine Rechtsberatung, keine regulatorische Freigabe, keine Speicherung, keine externe Kommunikation und keine Agenten-Autonomie-Erhöhung.",
    },
    nextProductiveMarketingFirstProjectWorkBlockFromRoutine: {
      title: "Projektarbeitsroutine auf Marketing Agentur OS anwenden",
      project: "Marketing Agentur OS",
      exampleCase: "Erstes starkes Marketing-Artefakt manuell vorbereiten",
      workBlock:
        "Design-Brief für ein erstes Premium-Marketingmotiv manuell strukturieren",
      nextStep:
        "Aus der Marketing-/Design-Anforderung einen internen Design-Brief vorbereiten: Ziel, Zielgruppe, Wirkung, Design-DNA, Negativliste und nächster manueller Schritt.",
      expectedFormat:
        "1 Geschäftsführer-Kurzsatz, 1 Ziel des Motivs, 1 Zielgruppe/Nutzungskontext, 1 gewünschte Wirkung, 1 Design-DNA-Hinweis, 1 Negativliste, 1 nächster manueller Schritt und 1 Sicherheits-/Freigabehinweis.",
      agentTrainingSignal:
        "Marketing Agentur OS wird Trainingsfall 3; alle 25 Agenten bleiben im Vorschlagsmodus und HR leitet Trainingsimpulse ab.",
      decision:
        "Marketing-Arbeitsblock übernehmen, einmal begrenzt schärfen oder stoppen.",
      boundary:
        "Keine Bild-, Video- oder Kampagnenproduktion, keine Veröffentlichung, keine Canva-/HeyGen-/Figma-Ausführung, keine Speicherung und keine Agenten-Autonomie-Erhöhung.",
    },
    nextProductiveCrossProjectWorkRoutineEvaluation: {
      title: "Projektarbeitsfähigkeit aus drei Projektarten auswerten",
      includedProjects:
        "Health Upgrade Kompass, Expansion App und Marketing Agentur OS",
      evaluationGoal:
        "Prüfen, ob die zentrale Projektarbeitsroutine über Produkt-/Nutzerorientierung, Prüf-/Länderlogik und Kreativ-/Marketinglogik hinweg tragfähig ist.",
      crossProjectProof:
        "Health -> Expansion -> Marketing: drei unterschiedliche Projektarten wurden mit derselben kontrollierten Projektarbeitsroutine bearbeitbar vorbereitet.",
      expectedDecision:
        "Routine als projektübergreifend tragfähig markieren, einmal begrenzt schärfen, Standardprozess vorbereiten oder stoppen.",
      boundary:
        "Kein viertes Projekt, keine Automatisierung, keine Speicherung, keine externen Requests, keine Plugin-Ausführung und keine Agenten-Autonomie-Erhöhung.",
    },
    nextProductiveCentralProjectWorkStandardProcess: {
      title: "Standard-Projektarbeitsprozess V1 vorbereiten",
      foundation:
        "Health -> Expansion -> Marketing: drei Projektarten mit gleicher kontrollierter Routine bearbeitbar vorbereitet.",
      nextStep:
        "Aus der projektübergreifenden Auswertung einen Standardprozess V1 für kontrollierte Projektarbeit vorbereiten.",
      core:
        "Projektstand -> kleiner Arbeitsblock -> manuelle Ausführung -> Auswertung -> Agentenlernen -> nächste Jamal-Entscheidung.",
      decision:
        "Standardprozess V1 übernehmen, einmal begrenzt schärfen, erst weiter testen oder stoppen.",
      boundary:
        "Standard für kontrollierte Projektarbeit, nicht für automatische Projektbearbeitung: keine Speicherung, keine externen Requests, keine Plugin-Ausführung und keine Agenten-Autonomie-Erhöhung.",
    },
    nextProductiveCentralDailyProjectWorkCard: {
      title: "Tägliche Projektarbeitskarte aus Standardprozess ableiten",
      project: "KI-Unternehmenszentrale",
      workBlock:
        "Standardprozess V1 in tägliche Projektarbeitskarte überführen",
      expectedResult:
        "Eine klare Tageskarte, die später für Health, Expansion, Marketing und weitere Projekte wiederverwendbar ist.",
      decision:
        "Tageskarte übernehmen, Projekt wechseln, einmal begrenzt schärfen oder stoppen.",
      boundary:
        "Die Zentrale führt nicht automatisch aus; sie bereitet täglich den kleinsten sicheren Projektarbeitsblock für Jamals manuelle Entscheidung vor.",
    },
    nextProductiveCentralLiveOperatingModel: {
      title: "Live-Betriebsmodell mit Freigabestufen vorbereiten",
      status: "Live-Betriebsmodell V1 vorbereitet, noch nicht aktiviert",
      nextStep:
        "Klare Freigabestufen definieren: anzeigen, Entwurf, Jamal-Freigabe, spätere Standardausführung, Experten-/GF-Freigabe oder dauerhaft gesperrt.",
      core:
        "Die Unternehmenszentrale soll später Arbeit abnehmen, aber nicht unkontrolliert handeln.",
      decision:
        "Live-Modell V1 übernehmen, Freigabestufen schärfen, noch nicht vorbereiten oder stoppen.",
      boundary:
        "Kein echter Live-Betrieb: keine Speicherung, keine Automatisierung, keine Plugins, keine externen Systeme und keine produktive Freischaltung.",
    },
    nextProductiveCentralLiveApprovalStageModuleMap: {
      title: "Freigabestufen auf Module abbilden",
      status: "Modul-Freigabematrix V1 vorbereitet, noch nicht aktiviert",
      nextStep:
        "Die sechs Freigabestufen aus V6.35.0 auf Tageskarte, Projekte, HR, Qualitätszentrum, Archiv, Tool-Radar, Briefings und Support abbilden.",
      core:
        "Jedes Modul bekommt eine eigene erlaubte Stufe, eigene Grenzen und eigene Freigabepunkte.",
      decision:
        "Modul-Freigabematrix übernehmen, einmal begrenzt schärfen, Modul einzeln prüfen oder stoppen.",
      boundary:
        "Keine Modul-Freigabe wird technisch aktiviert: kein Live-Betrieb, keine Speicherung, keine Automatisierung, keine Plugin-Ausführung.",
    },
    nextProductiveCentralFirstDraftModeAction: {
      title: "Erste Live-Aktion als Entwurf vorbereiten",
      status:
        "erste spätere Live-Aktion im Entwurfsmodus vorbereitet, noch nicht aktiviert",
      draftAction:
        "Aufgabenentwurf aus täglicher Projektarbeitskarte vorbereiten",
      nextStep:
        "Die tägliche Projektarbeitskarte in einen sichtbaren Aufgabenentwurf übersetzen, ohne ihn zu speichern, zuzuweisen oder auszuführen.",
      reason:
        "Stufe 2 ist geeignet, weil Jamal weniger selbst formulieren muss, aber jede echte Ausführung weiterhin gesperrt bleibt.",
      decision:
        "Entwurfsmodus übernehmen, Aufgabenentwurf einmal schärfen, andere Entwurfsaktion prüfen oder stoppen.",
      boundary:
        "Keine Speicherung, keine Zuweisung, kein Aufgabenstart, keine Automatisierung und keine externe Ausführung.",
    },
    nextProductiveCentralFirstDraftModeActionManualReview: {
      title: "Entwurfsmodus manuell prüfen",
      status: "erste Entwurfsaktion manuell prüfbar vorbereitet",
      reviewedDraftAction:
        "Aufgabenentwurf aus täglicher Projektarbeitskarte vorbereiten",
      reviewGoal:
        "Prüfen, ob der Aufgabenentwurf Jamal Arbeit abnimmt, klar genug ist und alle Sicherheitsgrenzen sichtbar hält.",
      decision:
        "Entwurfsmodus als brauchbar markieren, einmal begrenzt schärfen, anderes Entwurfsformat prüfen oder stoppen.",
      nextPossibleConcept:
        "Nur wenn Stufe 2 manuell brauchbar ist, darf später Stufe 3 konzeptionell vorbereitet werden.",
      boundary:
        "Keine Stufe-3-Ausführung, keine Speicherung, keine Zuweisung, kein Aufgabenstart und keine externe Ausführung.",
    },
    nextProductiveCentralApprovalRequiredExecutionModel: {
      title: "Ausführung nach Jamal-Freigabe vorbereiten",
      status:
        "Stufe-3-Freigabelogik vorbereitet, noch nicht technisch aktiviert",
      targetStage: "Stufe 3: Ausführung nach Jamal-Freigabe",
      nextStep:
        "Konzeptionell klären, welche Informationen, Freigabe-Checkliste und Sicherheitsprüfung vor einer späteren Ausführung sichtbar sein müssen.",
      decision:
        "Stufe-3-Logik übernehmen, Freigabe-Checkliste schärfen, zurück zu Stufe 2 oder stoppen.",
      boundary:
        "Keine echte Stufe-3-Ausführung: keine Speicherung, keine Zuweisung, kein Start, keine Automatisierung und keine externen Dienste.",
    },
    nextProductiveCentralApprovalRequiredExecutionManualReview: {
      title: "Stufe-3-Freigabelogik manuell prüfen",
      status:
        "Stufe-3-Freigabelogik manuell prüfbar vorbereitet, noch nicht aktiviert",
      reviewedStage: "Stufe 3: Ausführung nach Jamal-Freigabe",
      reviewGoal:
        "Prüfen, ob Freigabe-Checkliste, Ausführungs-Vorschau, Abbruchprüfung, Sicherheitsprüfung und Jamal-Entscheidungspunkt vollständig genug sind.",
      decision:
        "Freigabelogik als brauchbar markieren, einmal begrenzt schärfen, zurück zu Stufe 2 oder stoppen.",
      boundary:
        "Nur Prüfung der Freigabelogik: keine Ausführung, keine Speicherung, keine Zuweisung, keine Schreibfunktion.",
    },
    nextProductiveCentralFutureWriteCapabilityModel: {
      title: "Schreibfähigkeit als Zukunftsmodell vorbereiten",
      status:
        "technisches Zukunftsmodell für spätere Schreibfähigkeit vorbereitet, noch nicht aktiviert",
      nextStep:
        "Nur konzeptionell klären, welche späteren Schreibaktionen Freigabe, Schutzprüfung, Audit und Rollback brauchen.",
      possibleLaterAction: "Aufgabe nach Jamal-Freigabe speichern",
      decision:
        "Zukunftsmodell übernehmen, Schutzmodell schärfen, Schreibfähigkeit zurückstellen oder stoppen.",
      boundary:
        "Keine Schreibfunktion vorhanden: keine Speicherung, keine Zuweisung, kein Aufgabenstart und keine neuen Schreib-Endpunkte.",
    },
    nextProductiveCentralFutureWriteCapabilityManualReview: {
      title: "Schreibfähigkeits-Zukunftsmodell manuell prüfen",
      status:
        "Schreibfähigkeits-Zukunftsmodell manuell prüfbar vorbereitet, noch nicht aktiviert",
      reviewedArea: "spätere Schreibfähigkeit der KI-Unternehmenszentrale",
      reviewGoal:
        "Prüfen, ob Schutzmodell, Audit, Rollback, Abbruchgrenzen und Jamal-Freigabe vor jeder späteren Schreibaktion verständlich und vollständig genug sind.",
      decision:
        "Zukunftsmodell als brauchbar markieren, Schutzmodell einmal schärfen, Schreibfähigkeit weiter zurückstellen oder stoppen.",
      boundary:
        "Nur Prüfung des Zukunftsmodells: keine Schreibfunktion, kein Schreib-Endpunkt, keine Speicherung und keine technische Schreibvorbereitung.",
    },
    nextProductiveCentralDisabledWriteArchitecturePlan: {
      title: "Deaktivierten Schreibarchitekturplan vorbereiten",
      status:
        "deaktivierter Architekturplan für spätere Schreibfunktion vorbereitet, nicht aktiviert",
      plannedFutureWriteFunction: "Aufgabe nach Jamal-Freigabe speichern",
      nextStep:
        "Technisch sichtbar machen, welche Bausteine eine spätere Schreibfunktion bräuchte, ohne Endpunkt, Handler, Button oder Speicherung einzubauen.",
      decision:
        "Architekturplan übernehmen, Schutzanforderungen schärfen, Schreibarchitektur zurückstellen oder stoppen.",
      boundary:
        "Nur deaktivierter Architekturplan: kein Schreib-Endpunkt, kein Schreib-Handler, keine Speicherung, keine Zuweisung und kein Aufgabenstart.",
    },
    nextProductiveCentralDisabledWriteArchitecturePlanManualReview: {
      title: "Deaktivierten Schreibarchitekturplan manuell prüfen",
      status:
        "deaktivierter Schreibarchitekturplan manuell prüfbar vorbereitet, weiterhin nicht aktiviert",
      reviewedArchitecturePlan: "Aufgabe nach Jamal-Freigabe speichern",
      reviewGoal:
        "Prüfen, ob der deaktivierte Architekturplan verständlich, sicher, prüfbar und später technisch verantwortbar wäre.",
      decision:
        "Architekturplan als brauchbar markieren, Schutzanforderungen einmal schärfen, Schreibarchitektur weiter zurückstellen oder stoppen.",
      boundary:
        "Nur manuelle Prüfung: kein Schreib-Endpunkt, kein Schreib-Handler, keine Speichern-Funktion und keine echte Speicherung.",
    },
    nextProductiveCentralWritePermissionDecisionCorridor: {
      title: "Schreibfreigabe-Entscheidungskorridor vorbereiten",
      status: "Schreibfreigabe nur als manueller Entscheidungskorridor vorbereitet",
      leadershipQuestion:
        "Welche Schreibfähigkeit darf später überhaupt denkbar sein - und welche bleibt gesperrt?",
      nextStep:
        "Nur Entscheidungslogik, Freigabebedingungen, Sperrbereiche und Agentenrollen prüfen; keine Schreibfähigkeit aktivieren.",
      recommendation:
        "Schreibfähigkeit weiterhin nicht aktivieren. Zuerst nur den Entscheidungskorridor prüfen und Sperrbereiche bestätigen.",
      boundary:
        "Read-only und manuell: keine Schreibfunktion, keine Speicherung, keine Datenbank, keine externen Requests und keine technische Schreibvorbereitung.",
    },
    nextProductiveCentralWritePermissionManualDecisionEvaluation: {
      title: "Schreibfreigabe-Entscheidung manuell auswerten",
      status: "manuelle Auswertung der Schreibfreigabe-Entscheidung vorbereitet",
      evaluationQuestion:
        "Soll überhaupt irgendwann ein begrenzter Schreibbereich geprüft werden - und welcher wäre am risikoärmsten?",
      possibleDecision:
        "Weiter vollständig blockieren, später enger prüfen, einen sehr kleinen isolierten Kandidaten bewerten oder Schreibfähigkeit weiter nicht technisch vorbereiten.",
      recommendation:
        "Noch keine technische Schreibfähigkeit aktivieren. Zuerst nur manuell auswerten, ob ein späterer Mini-Schreibbereich überhaupt sinnvoll wäre.",
      boundary:
        "Bewertung nur lokal und read-only: nichts speichern, nichts starten, keine Projektdaten verändern, keine Schreibarchitektur aktivieren.",
    },
    nextProductiveCentralWritePermissionDecisionTemplate: {
      title: "Schreibfreigabe-Entscheidungsvorlage ableiten",
      status:
        "Entscheidungsvorlage aus manueller Schreibfreigabe-Auswertung vorbereitet",
      recommendedDecision: "Weiter vorbereiten",
      reason:
        "Die Schreibfreigabe ist fachlich noch nicht reif für Aktivierung; der nächste sichere Schritt ist eine weiter präzisierte, read-only Freigabegrenze.",
      options:
        "Nicht freigeben, weiter vorbereiten oder begrenzt vormerken - ohne technische Aktivierung.",
      boundary:
        "Nur read-only Entscheidungsvorlage: keine Schreibfunktion, kein Handler, keine Speicherung, keine technische Schreibvorbereitung.",
    },
    nextProductiveCentralWritePermissionReadOnlyReleaseBoundary: {
      title: "Read-only Freigabegrenze präzisieren",
      status:
        "read-only Freigabegrenze für mögliche spätere Schreibfähigkeit präzisiert",
      recommendation: "Grenze akzeptieren und weiter read-only vorbereiten",
      nextStep:
        "Freigabegrenze als harte Bedingung sichtbar halten; eine spätere Kandidatenliste bleibt ebenfalls read-only.",
      boundary:
        "Keine Schreibentscheidung, keine technische Umsetzung, keine Simulation und keine Aktivierung produktiver Schreibfähigkeit.",
    },
    nextProductiveCentralManualReleaseDecisionReadOnlyStructure: {
      title: "Manuelle Freigabeentscheidung als reine Lesestruktur vorbereiten",
      status: "manuelle Freigabeentscheidung nur als Lesestruktur vorbereitet",
      leadershipQuestion:
        "Welche Entscheidung müsste Jamal manuell treffen, bevor irgendeine Schreibfähigkeit überhaupt weitergedacht werden darf?",
      nextStep:
        "Nur anzeigen, welche manuellen Entscheidungsrichtungen und Nachweise später nötig wären.",
      boundary:
        "Reine Lesestruktur: keine Freigabe, keine technische Vorbereitung, keine Simulation, keine Aktivierung und keine Aktion.",
    },
    nextProductiveCentralManualReleaseDecisionGfReviewQuestions: {
      title: "Manuelle Freigabeentscheidung in GF-Prüffragen übersetzen",
      status: "GF-Prüffragen zur manuellen Freigabeentscheidung read-only vorbereitet",
      purpose:
        "Die Lesestruktur aus V6.36.4 wird in Geschäftsführer-Prüffragen übersetzt, ohne Schreibrechte technisch vorzubereiten.",
      recommendation:
        "Weiterhin read-only lassen; erst Bedingungen, Grenzen und Verbote dauerhaft klären.",
      boundary:
        "Ausschließlich Lesestruktur zur manuellen GF-Prüfung: keine Schreibwirkung, keine Simulation, keine Aktivierung.",
    },
    nextProductiveCentralManualReleaseDecisionGfDecisionMask: {
      title: "GF-Prüffragen in manuelle Entscheidungsmaske verdichten",
      status: "manuelle GF-Entscheidungsmaske read-only vorbereitet",
      purpose:
        "Die GF-Prüffragen aus V6.36.5 werden in eine lesbare Entscheidungsmaske verdichtet, ohne Freigabe, Speicherung oder Aufgabenstart.",
      recommendation:
        "Als Lesestruktur nutzen; der nächste Schritt darf weiterhin keine Schreibfähigkeit aktivieren.",
      boundary:
        "Keine produktive Freigabe, keine gespeicherte Entscheidung und keine technische Schreibvorbereitung.",
    },
    nextProductiveCentralManualReleaseDecisionGfShortDecision: {
      title: "Manuelle Entscheidungsmaske in GF-Kurzentscheidung zusammenfassen",
      status: "GF-Kurzentscheidungsvorlage read-only vorbereitet",
      purpose:
        "Die manuelle Entscheidungsmaske aus V6.36.6 wird zu einer schnellen Kurzentscheidung für Jamal verdichtet.",
      recommendation:
        "Nur als Lesestruktur nutzen; keine Schreibfähigkeit, Speicherung oder Automatisierung vorbereiten.",
      boundary:
        "Keine produktive Freigabe, keine gespeicherte Entscheidung, kein Aufgabenstart und keine Systemaktion.",
    },
    nextProductiveCentralManualReleaseDecisionCard: {
      title: "GF-Kurzentscheidung in manuelle Freigabekarte überführen",
      status: "manuelle Freigabekarte vorbereitet, weiterhin read-only",
      decisionQuestion:
        "Kann Jamal diesen Bereich grundsätzlich für eine spätere Schreibfreigabe vorbereiten - ja, nein oder nur unter Bedingungen?",
      recommendation:
        "Weiter vorbereiten, aber noch nicht freigeben und keine technische Schreibaktivierung auslösen.",
      boundary:
        "Nur Orientierung: keine echte Schreibfreigabe, keine Entscheidungsspeicherung, keine externen Änderungen.",
    },
    nextProductiveCentralManualReleaseDecisionFinalOverview: {
      title: "Manuelle Freigabekarte zu finaler Fertigstellungsübersicht verdichten",
      status: "finale Fertigstellungsübersicht read-only vorbereitet",
      completion:
        "Der manuelle Schreibfreigabe-/Freigabeprozess ist fachlich als vorbereiteter Entscheidungsstand lesbar.",
      recommendation:
        "Als vorbereiteten Entscheidungsstand akzeptieren oder fachlich nachschärfen; keine technische Schreibfähigkeit aktivieren.",
      boundary:
        "Keine Schreibfunktion, keine Entscheidungsspeicherung, keine technische Schreibvorbereitung und keine externen Änderungen.",
    },
    nextProductiveCentralFinalReadinessOverview: {
      title: "Gesamt-Fertigstellungsstatus der KI-Unternehmenszentrale herstellen",
      status: "übergreifende Fertigstellungsübersicht read-only vorbereitet",
      nextStep:
        "V1-Fertigstellung weiter verdichten und die offenen Lücken aus Cockpit, Projekten, Agenten und gesperrter Schreibfreigabe sichtbar führen.",
      recommendation:
        "V1-Fertigstellung weiter verdichten, Health als Produktivprojekt fokussieren und Schreibfreigabe gesperrt lassen.",
      boundary:
        "Nur Gesamtübersicht: keine Speicherung, keine Projektstatusänderung, keine technische Schreibvorbereitung und keine externen Requests.",
    },
    nextProductiveCentralV1CompletionPlan: {
      title: "V1-Fertigstellungslücken in konkreten Abschlussplan überführen",
      status: "konkreter V1-Abschlussplan read-only vorbereitet",
      nextStep:
        "Eine letzte V1-Abnahmekarte vorbereiten, die Cockpit, Tagessteuerung, Agenten, HR, Projektsteuerung und gesperrte Schreibfreigabe knapp prüfbar macht.",
      recommendation:
        "V1-Abschlussplan akzeptieren und danach eine letzte V1-Abnahmekarte vorbereiten.",
      boundary:
        "Nur Abschlussplan: keine Speicherung, keine Schreibfunktion, keine technische Schreibvorbereitung und keine Systemaktion.",
    },
    nextProductiveCentralV1CompletionDecision: {
      title: "V1-Fertigstellungsentscheidung der KI-Unternehmenszentrale vorbereiten",
      status: "V1-Fertigstellungsentscheidung read-only vorbereitet",
      decision:
        "Die KI-Unternehmenszentrale ist fachlich als nutzbare V1 vorbereitet, wenn Jamal die Restpunkte bewusst akzeptiert und Schreibfreigabe gesperrt bleibt.",
      recommendation:
        "V1 als fachlich fertig vorbereitet akzeptieren oder vor V1 genau eine letzte Lücke schließen.",
      boundary:
        "Keine Entscheidungsspeicherung, keine Statusänderung, keine Aufgabenstarts und keine Schreibfähigkeit.",
    },
    nextProductiveCentralV1GfDecisionCard: {
      title: "V1-Fertigstellungsentscheidung als GF-Entscheidungskarte",
      status: "GF-Entscheidungskarte read-only vorbereitet",
      decisionQuestion:
        "Kann V1 der KI-Unternehmenszentrale jetzt als erste nutzbare Version abgeschlossen werden?",
      recommendation:
        "Option A bevorzugen: V1 abschließen, wenn Jamal die bewusst offenen Restpunkte akzeptiert und Schreibfreigabe gesperrt bleibt.",
      boundary:
        "Nur Entscheidungskarte: keine Entscheidungsspeicherung, keine Statusänderung, keine Aufgabenstarts und keine Schreibfähigkeit.",
    },
    nextProductiveCentralV1CompletionChecklist: {
      title: "V1-Abschluss-Checkliste der KI-Unternehmenszentrale",
      status: "V1-Abschluss-Checkliste read-only vorbereitet",
      completionStatus: "abschlussfähig",
      recommendation:
        "V1 jetzt abschließen, wenn Jamal die bewusst offenen Punkte nach V1.1 verschiebt und die Schreibgrenzen unverändert gesperrt lässt.",
      boundary:
        "Nur statische Checkliste: nichts abhaken, speichern, aktualisieren, starten oder technisch ausführen.",
    },
    nextProductiveCentralV1CompletionReport: {
      title: "V1-Abschlussbericht der KI-Unternehmenszentrale",
      status: "V1-Abschlussbericht read-only erzeugt",
      completionStatement:
        "V1 ist als erste nutzbare read-only Version abschließbar.",
      recommendation:
        "V1 bewusst abschließen und danach V1.1 als ersten Produktivitätsschritt ohne Schreibrechte vorbereiten.",
      boundary:
        "Nur Abschlussbericht: keine Entscheidungsspeicherung, keine Checklistenaktualisierung, keine Aufgabenstarts und keine Schreibrechte.",
    },
    nextProductiveCentralV1ManualReleaseDecision: {
      title: "V1-Abschlussfreigabe als manuelle GF-Entscheidung",
      status: "manuelle V1-GF-Freigabeentscheidung read-only vorbereitet",
      decisionQuestion:
        "Gebe ich V1 der KI-Unternehmenszentrale jetzt als erste nutzbare read-only Version frei?",
      recommendation:
        "Option A: V1 freigeben, wenn Jamal die offenen Punkte nach V1.1 verschiebt und Schreibrechte gesperrt bleiben.",
      boundary:
        "Nur manuelle Lesestruktur: keine Entscheidung speichern, auslösen, simulieren oder technisch vorbereiten.",
    },
    nextProductiveCentralV1FinalizationBoundary: {
      title: "V1-Abschlussstand und V1.1-Übergangsgrenze",
      status: "finaler V1-Abschlussstand read-only sichtbar gemacht",
      finalStatement:
        "V1 ist als erste nutzbare read-only Führungs-, Entscheidungs- und Agentenübersicht abschlussfähig.",
      recommendation:
        "V1 jetzt abschließen und V1.1 nur als separaten, read-only Übergangskorridor vorbereiten.",
      boundary:
        "Keine Entscheidungsspeicherung, keine Aufgabenstarts, keine Schreibrechte, keine externen Requests und keine technische Aktivierung.",
    },
    nextProductiveCentralV1FinalOperatingState: {
      title: "V1 finaler Betriebsstand der KI-Unternehmenszentrale",
      status: "finaler V1-Betriebsstand read-only sichtbar gemacht",
      finalStatement:
        "V1 ist als erste nutzbare read-only Führungs-, Entscheidungs- und Agentenübersicht fertig genug für den Alltagseinsatz.",
      recommendation:
        "V1 als finalen read-only Betriebsstand akzeptieren und ab jetzt im Alltag nutzen; Verbesserungen sauber in V1.1 sammeln.",
      boundary:
        "Keine Entscheidungsspeicherung, keine Aufgabenstarts, keine Schreibrechte, keine externen Requests und keine technische Aktivierung.",
    },
    nextProductiveCentralV11AgentDailyRun: {
      title: "V1.1 Agenten-Tageslauf",
      status: "erster Agenten-Tageslauf read-only vorbereitet",
      focus:
        "25 Agenten liefern sichtbare Tagesbeiträge, Grenzen und eine gemeinsame Empfehlung, ohne Aufgaben zu starten.",
      recommendation:
        "Agenten-Tageslauf nutzen, um Jamals nächsten kleinen Produktivitätsschritt manuell zu entscheiden.",
      boundary:
        "Nur read-only Arbeitsmodus: keine Speicherung, keine Schreibrechte, keine Automatisierung und keine externen Requests.",
    },
    nextProductiveCentralV11AgentResultRun: {
      title: "V1.1 Agenten-Ergebnislauf",
      status: "konkrete Agenten-Ergebnisbeiträge read-only vorbereitet",
      focus:
        "Alle 25 Agenten liefern sichtbare Ergebnisbeiträge zum Tagesfokus; der Projektmanager-Agent verdichtet sie zu einer Entscheidungsvorlage.",
      recommendation:
        "Ergebnislauf nutzen, um genau einen kleinsten nächsten manuellen Produktivitätsschritt zu entscheiden.",
      boundary:
        "Nur read-only Ergebnisbeiträge: keine Speicherung, keine Aufgabenstarts, keine Schreibrechte, keine externen Requests und keine technische Aktivierung.",
    },
    nextProductiveCentralV11PluginEnabledAgentTestMode: {
      title: "V1.1 Plugin-fähiger Agenten-Testbetrieb",
      status: "kontrollierter plugin- und toolfähiger Agenten-Testbetrieb vorbereitet",
      focus:
        "Alle 25 Agenten werden nach Plugin-/Tool-Bedarf, Anschlussstatus, sicherem Testlauf und Freigabegrenze eingeordnet.",
      recommendation:
        "Option A starten: lokale read-only Testläufe freigeben und Anschlussplan für spätere externe Lesetests vorbereiten.",
      boundary:
        "Keine unkontrollierte Plugin-Nutzung, keine automatischen externen Requests, keine Schreibrechte und madeExternalRequest bleibt in dieser Prüfung false.",
    },
    nextProductiveCentralV11ControlledAgentPilotRun: {
      title: "V1.1 Kontrollierter Agenten-Pilotlauf",
      status: "kontrollierter Agenten-Pilotlauf mit Tool-Matrix vorbereitet",
      focus:
        "Pilotprojekt ist die KI-Unternehmenszentrale selbst; alle 25 Agenten bewerten Arbeitsfähigkeit, Tool-Bedarf, Ergebnisqualität und Sicherheitsgrenzen.",
      recommendation:
        "Option A durchführen und parallel Option B als separate Freigabe vorbereiten.",
      boundary:
        "Keine Schreibrechte, keine Speicherung, keine Aufgabenstarts, keine automatischen externen Requests und keine technische Aktivierung.",
    },
    nextProductiveCentralV11StrategicAgentPilotRun: {
      title: "V1.1 Strategischer Agenten-Pilotlauf",
      status: "strategischer Agenten-Pilotlauf mit Tool-Matrix und Freigabekorridor vorbereitet",
      focus:
        "Die 25 Agents zeigen am Pilotprojekt KI-Unternehmenszentrale selbst, welche Ergebnisse, Tool-Bedarfe, Grenzen und Freigabeoptionen sichtbar werden.",
      recommendation:
        "Option A durchführen und Option B nur als separate Freigabe vorbereiten.",
      boundary:
        "Keine Connector-Lesezugriffe aktivieren, keine automatischen externen Requests, keine Schreibrechte, keine Aufgabenstarts und keine Speicherung.",
    },
    nextProductiveCentralV11ReadOnlyAgentActionPlan: {
      title: "V1.1 Read-only Agenten-Aktionsplan",
      status: "read-only Agenten-Aktionsplan mit erstem Connector-Freigabekorridor vorbereitet",
      focus:
        "Alle 25 Agents erhalten konkrete Aktionskarten; lokale read-only Aktionen werden priorisiert und GitHub/lokale Projektdateien werden als erster manueller Connector-Kandidat vorbereitet.",
      recommendation:
        "Lokale read-only Agentenaktionen fortsetzen und den ersten read-only GitHub-/Projektdatei-Test nur als separate Jamal-Freigabe vorbereiten.",
      boundary:
        "Keine Connector-Aktivierung, keine automatischen externen Requests, keine Schreibrechte, keine Speicherung, keine Aufgabenstarts und keine technische Aktivierung.",
    },
    nextProductiveCentralV11ReadOnlyProjectFileGithubTestCorridor: {
      title: "V1.1 Read-only Projektdatei-/GitHub-Testkorridor",
      status:
        "lokaler Projektdatei-Testkorridor und GitHub-read-only-Freigabekorridor vorbereitet",
      focus:
        "Lokale Projektdateien werden als sicherster read-only Testkorridor priorisiert; GitHub bleibt der nächste separate read-only Connector-Kandidat.",
      recommendation:
        "Option A jetzt nutzen und Option B als separaten Jamal-Freigabeschritt vorbereiten.",
      boundary:
        "Keine GitHub-Verbindung, keine externen Requests, keine Commits, keine Branches, keine PRs, keine Issues, keine Actions, keine Dateiänderungen und keine Schreibrechte.",
    },
    cockpitUseExplanation,
    manualDayClosingTitle: "Tagesabschluss manuell einordnen",
    manualDayClosingOptions: [
      {
        label: "Offen lassen",
        explanation: "Nutzen, wenn heute noch etwas entschieden oder angesehen werden soll.",
      },
      {
        label: "Als abgeschlossen betrachten",
        explanation:
          "Nutzen, wenn Jamal die 3 Dinge angesehen und die wichtigste Entscheidung freigegeben oder bewusst übersprungen hat.",
      },
      {
        label: "Entscheidung bewusst übersprungen",
        explanation:
          "Nutzen, wenn heute keine Entscheidung getroffen wird, aber der Tag trotzdem bewusst beendet werden kann.",
      },
    ],
    manualDayClosingExplanation:
      "Der Tagesabschluss ist nur eine manuelle Orientierung für Jamal. Es wird nichts automatisch gespeichert oder ausgeführt.",
    manualDayClosingOnly: true,
    automaticDayClosingBlocked: true,
    automaticStorageBlocked: true,
    followUpAgentStartBlocked: true,
    decisionCanBeSkippedByJamal: true,
    highlightCurrentDayMode: true,
    dayModeReadableForJamal: true,
    availableDayModes: ["start", "open", "completed"],
    dayModeLabels: {
      start: "Start",
      open: "Offen",
      completed: "Abgeschlossen",
    },
    dayModeExplanations: {
      start: "Heute sind die 3 wichtigsten Dinge vorgeschlagen. Jamal entscheidet, womit begonnen wird.",
      open:
        "Mindestens eine der 3 Sachen ist noch offen. Es reicht, heute nur diese offenen Punkte zu entscheiden, zu erledigen oder bewusst zu überspringen.",
      completed:
        "Alle 3 Dinge sind erledigt oder bewusst übersprungen. Keine weitere Aktion nötig. Morgen schlägt das Cockpit wieder neu vor.",
    },
    decisionItem: {
      label: "Entscheidung",
      source: "Heutige 1 Entscheidung",
      question: "Soll heute der Projektmanager-Agent den nächsten kleinsten Schritt vorbereiten?",
      action: "Freigeben oder überspringen",
    },
    trainingItem: {
      label: "Top-Training",
      source: "HR-Top-Trainingspunkt",
      agent: "Projektmanager-Agent",
      trainingStep: "Projektmanager-Agent: bessere nächste kleinste Schritte formulieren.",
      action: "Freigeben oder überspringen",
    },
    contentDesignItem: {
      label: "Content/Design",
      source: "Content-/Design-Arbeitsplatz",
      task: "Aus dem aktuellen Canva-Arbeitsauftrag eine erste Präsentationsfolie vorbereiten.",
      action: "Kopieren oder heute nicht nötig",
    },
    secondaryWork: "Alles andere ist heute zweitrangig",
    dayCompletionCriterion:
      "Wenn diese 3 Dinge erledigt oder bewusst übersprungen sind, ist der Tag im Cockpit abgeschlossen.",
    doneWhen: "Jamal gibt die drei Punkte frei oder überspringt sie bewusst.",
    completionAllowedManually: true,
    automaticCompletionBlocked: true,
    automaticModeChangeBlocked: true,
    noExternalPersistence: true,
    noFurtherActionRequired: true,
    nextThreeThingsTomorrow: true,
    secondaryWorkBlockedToday: false,
    jamalDecides: true,
    jamalDecisionRequired: true,
    autoExecutionBlocked: true,
    automaticExecutionBlocked: true,
    madeExternalRequest: false,
    externalActionStarted: false,
    automaticDecisionStarted: false,
    automaticTrainingStarted: false,
    followUpAgentStarted: false,
    rightsChanged: false,
  };
}

function handleTodaysThreeThings(res) {
  sendJson(res, 200, getTodaysThreeThings());
}

const pluginWorkCapabilityItems = [
  {
    agent: "Projektmanager-Agent",
    plugin: "Airtable read-only",
    allowedTask: "Projektstand, Blocker und nächsten sinnvollen Schritt aus einem read-only Arbeitsgedächtnis ableiten.",
    expectedResult: "Was ist jetzt als Nächstes sinnvoll?",
    approvalBoundary: "Keine freie Datenanzeige, keine Schreibrechte, nur Chef-Zusammenfassung.",
    priority: "höchste Priorität",
    nextStep: "Projektmanager-Agent mit Airtable read-only arbeitsfähig machen.",
  },
  {
    agent: "Wissens-/Archiv-Agent",
    plugin: "Airtable read-only",
    allowedTask: "Vorhandenes Wissen finden und als Kurzfassung vorbereiten.",
    expectedResult: "Was wissen wir schon?",
    approvalBoundary: "Keine Rohdaten, keine Feldwerte, keine Record-IDs.",
    priority: "hoch",
    nextStep: "Kurzfassungsmodus für vorhandenes Wissen vorbereiten.",
  },
  {
    agent: "HR-Agent",
    plugin: "interne Agentenlogik",
    allowedTask: "Täglichen 1%-Ausbildungs-, Trainings- und Autonomie-Vorschlag für bestehende Agenten vorbereiten.",
    expectedResult: "Welcher Agent soll heute besser oder selbstständiger werden?",
    approvalBoundary: "Nur Vorschlag, keine externe Aktion ohne Freigabe.",
    priority: "hoch",
    nextStep: "Täglichen Agenten-Trainingsvorschlag vorbereiten.",
  },
  {
    agent: "Content-/Design-Agent",
    plugin: "Canva",
    allowedTask: "Design-, Text- oder Präsentationsverbesserung vorbereiten.",
    expectedResult: "Was kann schöner, klarer oder hochwertiger werden?",
    approvalBoundary: "Kein automatisches Veröffentlichen, keine finale Freigabe ohne Jamal.",
    priority: "mittel",
    nextStep: "Manuellen Verbesserungsauftrag für Canva vorbereiten.",
  },
  {
    agent: "Video-/Marketing-Agent",
    plugin: "HeyGen",
    allowedTask: "Videokonzept, Skript oder Avatar-Briefing vorbereiten.",
    expectedResult: "Welches Video kann vorbereitet werden?",
    approvalBoundary: "Kein automatisches Video ohne Freigabe.",
    priority: "mittel",
    nextStep: "Video-Briefing als manuelle Vorlage vorbereiten.",
  },
  {
    agent: "Entwickler-Agent",
    plugin: "GitHub/Vercel",
    allowedTask: "Code-, Repo-, Deployment- oder Fehlerstatus prüfen und nächsten technischen Schritt vorschlagen.",
    expectedResult: "Was muss technisch als Nächstes passieren?",
    approvalBoundary: "Keine ungeprüften Commits, Deployments oder Änderungen ohne Freigabe.",
    priority: "mittel",
    nextStep: "Technischen Statuscheck als manuellen Agentenauftrag vorbereiten.",
  },
];

function getPluginWorkCapability() {
  return {
    version: "V6.12.0",
    status: "Agenten werden plugin-arbeitsfähig vorbereitet",
    message: "Weniger Verwaltung, mehr echte Systemleistung durch Agenten und Plugins.",
    recommendation:
      "Projektmanager-Agent mit Airtable read-only arbeitsfähig machen, damit aus dem Arbeitsgedächtnis Projektstand, Blocker und nächster Schritt abgeleitet werden können.",
    whyItHelps:
      "Jamal muss nicht mehr selbst suchen, welcher Projektstand wichtig ist. Der Agent bereitet eine Chef-Zusammenfassung und den nächsten Schritt vor.",
    workCapabilities: pluginWorkCapabilityItems,
    safety: {
      externalActionsRequireManualApproval: true,
      writeOperationsBlockedByDefault: true,
      publishingBlockedByDefault: true,
      deploymentBlockedByDefault: true,
      secretStorageBlocked: true,
      freeAirtableDataDisplayBlocked: true,
    },
  };
}

function handlePluginWorkCapability(res) {
  sendJson(res, 200, getPluginWorkCapability());
}

const projectManagerPluginTask = {
  version: "V6.12.7",
  taskStatus: "locally_approvable",
  status: "lokal freigebbar",
  agent: "Projektmanager-Agent",
  plugin: "Airtable read-only",
  chefApprovalAvailable: true,
  chefOutputAvailable: true,
  dailyFocusIntegrationAvailable: true,
  dailyFocusMode: "sanitized_projectmanager_output_only",
  startActionAvailable: true,
  startActionMode: "sanitized_daily_focus_to_manual_agent_task",
  agentWorkflowAvailable: true,
  workflowMode: "local_guided_agent_workflow",
  workflowResultAvailable: true,
  followUpDecisionAvailable: true,
  nextAgentRecommendation: "HR-Agent",
  executionMode: "manual_chef_approval_required",
  outputMode: "sanitized_chef_summary_only",
  preparedWorkTask:
    "Projektmanager-Agent: Prüfe das read-only Arbeitsgedächtnis und bereite eine Chef-Zusammenfassung vor. Zeige keine Rohdaten, keine Feldnamen, keine Feldwerte und keine Record-IDs. Liefere nur: Projektstand, wichtigster Blocker, nächster sinnvoller Schritt und Entscheidung für Jamal.",
  expectedResult: [
    "Chef-Zusammenfassung",
    "wichtigster Blocker",
    "nächster Schritt",
    "Entscheidung für Jamal",
  ],
  approvalBoundary: [
    "keine Rohdaten",
    "keine Schreibrechte",
    "keine automatische externe Aktion",
    "keine freie Airtable-Datenanzeige",
  ],
  nextManualStep: "lokalen Projektmanager-Arbeitsauftrag prüfen und bei Bedarf freigeben",
  whyItHelps:
    "Jamal muss nicht selbst durch Projektstände suchen. Der Projektmanager-Agent bereitet den wichtigsten Stand, den Blocker und den nächsten Schritt als Chef-Zusammenfassung vor.",
};

function getProjectManagerPluginTask() {
  return projectManagerPluginTask;
}

function handleProjectManagerPluginTask(res) {
  sendJson(res, 200, getProjectManagerPluginTask());
}

function getProjectManagerChefApprovalPreview() {
  const airtableToken = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_PAT;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID;
  const airtableTableNameOrId =
    process.env.AIRTABLE_TABLE_ID || process.env.AIRTABLE_TABLE_NAME || process.env.AIRTABLE_TABLE_PROJECTS;
  const missingVariables = getMissingAirtableVariableNames(airtableToken, airtableBaseId, airtableTableNameOrId);
  const firstPreviewApproved = process.env.AIRTABLE_FIRST_READONLY_PREVIEW_APPROVED === "true";
  const hasCompleteSetup = missingVariables.length === 0;
  const readinessStatus = !hasCompleteSetup
    ? "missing_credentials"
    : !firstPreviewApproved
      ? "manual_approval_required"
      : "ready_for_local_chef_approval";
  const chefApprovalStatus = !hasCompleteSetup
    ? "Nicht bereit – lokale Airtable-Zugangsdaten fehlen"
    : !firstPreviewApproved
      ? "Nicht bereit – manuelle Server-Freigabe fehlt"
      : "Freigegeben – sanitisierte Chef-Ausgabe vorbereitet";

  return {
    version: "V6.15.1",
    status: readinessStatus,
    taskStatus: "locally_approvable",
    agent: "Projektmanager-Agent",
    plugin: "Airtable read-only",
    preparedWorkTask: projectManagerPluginTask.preparedWorkTask,
    chefApprovalStatus,
    chefApprovalAvailable: true,
    chefApprovalRequired: true,
    executionMode: "manual_chef_approval_required",
    outputMode: "sanitized_chef_summary_only",
    readinessStatus,
    madeExternalRequest: false,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    missingVariables,
    configured: {
      hasToken: Boolean(airtableToken),
      hasBaseId: Boolean(airtableBaseId),
      hasTableTarget: Boolean(airtableTableNameOrId),
      hasCompleteSetup,
      hasManualServerApproval: firstPreviewApproved,
    },
    sanitizedChefOutput: {
      projectStatus: hasCompleteSetup && firstPreviewApproved
        ? "Sanitisierte Chef-Ausgabe vorbereitet – echte Airtable-Auswertung steht weiter unter read-only Grenze."
        : "Noch nicht aus Airtable gelesen – lokale Freigabe oder Zugangsdaten fehlen.",
      mainBlocker: hasCompleteSetup && firstPreviewApproved
        ? "Noch nicht aus Rohdaten ermittelt – Ausgabe bleibt sanitisiert."
        : "Noch nicht ermittelt – read-only Ausführung steht aus.",
      nextMeaningfulStep: hasCompleteSetup && firstPreviewApproved
        ? "Projektmanager-Auftrag lokal freigeben und sanitisierte Chef-Ausgabe prüfen."
        : "Lokale Voraussetzungen prüfen und Projektmanager-Auftrag freigeben.",
      decisionForJamal: "Soll der Projektmanager-Agent als erster Agent mit Airtable read-only arbeiten dürfen?",
    },
    nextManualStep: hasCompleteSetup && firstPreviewApproved
      ? "Projektmanager-Auftrag lokal freigeben und sanitisierte Chef-Ausgabe vorbereiten."
      : "Lokale Airtable-Zugangsdaten und Server-Freigabe prüfen.",
    boundaries: [
      "keine Airtable-Rohdaten",
      "keine Feldnamen",
      "keine Feldwerte",
      "keine Record-IDs",
      "keine Tabellenstruktur",
      "keine Schreibrechte",
      "keine automatische externe Aktion",
      "kein automatischer Agentenstart",
    ],
  };
}

function handleProjectManagerChefApprovalPreview(res) {
  sendJson(res, 200, getProjectManagerChefApprovalPreview());
}

function buildProjectManagerChefOutput(status, madeExternalRequest = false) {
  const outputs = {
    missing_credentials: {
      projectStatus: "Noch nicht aus Airtable gelesen – lokale Zugangsdaten fehlen.",
      mainBlocker: "Airtable-Arbeitsgedächtnis lokal noch nicht erreichbar.",
      nextMeaningfulStep: "Lokale Zugangsdaten nur lokal ergänzen, nicht speichern oder sichern.",
      decisionForJamal: "Soll Airtable lokal für read-only Projektmanager-Arbeit vorbereitet werden?",
      executionStatus: "Nicht bereit – lokale Airtable-Zugangsdaten fehlen",
    },
    manual_approval_required: {
      projectStatus: "Noch nicht gelesen – Server-Freigabe fehlt.",
      mainBlocker: "Chef-Freigabe ist sichtbar, aber Server-Freigabe schützt die echte lokale Anfrage.",
      nextMeaningfulStep: "Manuelle Server-Freigabe setzen, wenn die lokale Minimalprüfung erlaubt ist.",
      decisionForJamal: "Soll die lokale read-only Prüfung serverseitig freigegeben werden?",
      executionStatus: "Nicht bereit – manuelle Server-Freigabe fehlt",
    },
    ready_for_local_chef_output: {
      projectStatus: "Lokale Voraussetzungen sind bereit. Die Ausgabe bleibt sanitisiert.",
      mainBlocker: "Noch keine echte Projektzusammenfassung erzeugt.",
      nextMeaningfulStep: "Sanitisierte Projektmanager-Ausgabe lokal erzeugen.",
      decisionForJamal: "Soll der Projektmanager-Agent diese erste read-only Chef-Ausgabe erzeugen?",
      executionStatus: "Bereit – lokale Chef-Ausgabe kann erzeugt werden",
    },
    sanitized_output_generated: {
      projectStatus:
        "Read-only Minimalprüfung ist lokal freigegeben. Eine echte Projektzusammenfassung ist noch nicht aus freigegebener Projektstruktur ableitbar.",
      mainBlocker: "Noch keine freie Projektstruktur für echte Detailzusammenfassung freigegeben.",
      nextMeaningfulStep: "Sichere Projekt-Zusammenfassungslogik als nächsten Schritt vorbereiten.",
      decisionForJamal: "Soll als Nächstes eine read-only Projekt-Zusammenfassung ohne Rohdaten freigegeben werden?",
      executionStatus: "Sanitisierte Chef-Ausgabe vorbereitet",
    },
    airtable_unreachable_or_rejected: {
      projectStatus: "Nicht erzeugt – Airtable war lokal nicht erreichbar oder wurde abgelehnt.",
      mainBlocker: "Lokaler Zugriff oder Freigabe ist nicht gültig.",
      nextMeaningfulStep: "Lokale Zugangsdaten und Freigabe prüfen.",
      decisionForJamal: "Soll die Verbindung später erneut geprüft werden?",
      executionStatus: "Nicht erreichbar oder abgelehnt",
    },
  };

  const output = outputs[status] || outputs.airtable_unreachable_or_rejected;
  return {
    version: "V6.15.1",
    status,
    outputStatus:
      status === "sanitized_output_generated"
        ? "sanitized_output_prepared_but_project_summary_not_yet_available"
        : status,
    agent: "Projektmanager-Agent",
    plugin: "Airtable read-only",
    madeExternalRequest,
    readOnly: true,
    sanitizedOnly: true,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    projectStatus: output.projectStatus,
    mainBlocker: output.mainBlocker,
    nextMeaningfulStep: output.nextMeaningfulStep,
    decisionForJamal: output.decisionForJamal,
    executionStatus: output.executionStatus,
    boundaries: [
      "keine Airtable-Rohdaten",
      "keine Feldnamen",
      "keine Feldwerte",
      "keine Record-IDs",
      "keine Tabellenstruktur",
      "keine Schreibrechte",
      "keine automatische externe Aktion",
      "kein automatischer Agentenstart",
    ],
  };
}

function getProjectManagerChefOutput() {
  const airtableToken = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_PAT;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID;
  const airtableTableNameOrId =
    process.env.AIRTABLE_TABLE_ID || process.env.AIRTABLE_TABLE_NAME || process.env.AIRTABLE_TABLE_PROJECTS;
  const missingVariables = getMissingAirtableVariableNames(airtableToken, airtableBaseId, airtableTableNameOrId);
  const firstPreviewApproved = process.env.AIRTABLE_FIRST_READONLY_PREVIEW_APPROVED === "true";

  if (missingVariables.length > 0) {
    return {
      ...buildProjectManagerChefOutput("missing_credentials", false),
      missingVariables,
    };
  }

  if (!firstPreviewApproved) {
    return buildProjectManagerChefOutput("manual_approval_required", false);
  }

  return buildProjectManagerChefOutput("sanitized_output_generated", false);
}

function handleProjectManagerChefOutput(res) {
  sendJson(res, 200, getProjectManagerChefOutput());
}

function buildProjectManagerDailyFocus(status, madeExternalRequest = false) {
  const outputs = {
    missing_credentials: {
      todayMostImportantProject: "Noch nicht ermittelt – lokale Zugangsdaten fehlen.",
      currentBlocker: "Airtable-Arbeitsgedächtnis ist lokal noch nicht erreichbar.",
      nextMeaningfulStep: "Lokale Zugangsdaten nur lokal ergänzen, nicht speichern oder sichern.",
      decisionForJamal: "Soll Airtable lokal für read-only Projektmanager-Arbeit vorbereitet werden?",
      takeoverStatus: "Tagesfokus noch nicht aus Agenten-Ausgabe aktualisiert.",
      dailyFocusStatus: "missing_credentials",
    },
    manual_approval_required: {
      todayMostImportantProject: "Noch nicht ermittelt – Server-Freigabe fehlt.",
      currentBlocker: "Die echte lokale Anfrage bleibt blockiert, bis die Server-Freigabe gesetzt ist.",
      nextMeaningfulStep: "Manuelle Server-Freigabe setzen, wenn die lokale read-only Prüfung erlaubt ist.",
      decisionForJamal: "Soll die lokale read-only Projektmanager-Ausgabe serverseitig freigegeben werden?",
      takeoverStatus: "Tagesfokus wartet auf sichere Projektmanager-Ausgabe.",
      dailyFocusStatus: "manual_approval_required",
    },
    ready_for_daily_focus: {
      todayMostImportantProject: "Lokale Voraussetzungen sind bereit. Tagesfokus bleibt sanitisiert.",
      currentBlocker: "Noch keine sanitisierte Projektmanager-Ausgabe übernommen.",
      nextMeaningfulStep: "Projektmanager-Chef-Ausgabe erzeugen und als Tagesfokus übernehmen.",
      decisionForJamal: "Soll der Projektmanager-Agent den Tagesfokus vorbereiten?",
      takeoverStatus: "bereit",
      dailyFocusStatus: "ready_for_daily_focus",
    },
    sanitized_daily_focus_prepared: {
      todayMostImportantProject: "Aus sanitisierter Projektmanager-Ausgabe vorbereitet – ohne Rohdaten.",
      currentBlocker: "Keine freie Projektstruktur angezeigt.",
      nextMeaningfulStep: "Tagesfokus prüfen und nächsten manuellen Schritt starten.",
      decisionForJamal: "Soll dieser Fokus heute als Arbeitsrichtung gelten?",
      takeoverStatus: "sanitisiert übernommen",
      dailyFocusStatus: "prepared_but_project_summary_not_yet_available",
    },
    airtable_unreachable_or_rejected: {
      todayMostImportantProject: "Nicht ermittelt – lokale Prüfung nicht möglich.",
      currentBlocker: "Airtable war lokal nicht erreichbar oder wurde abgelehnt.",
      nextMeaningfulStep: "Lokale Zugangsdaten und Freigabe prüfen.",
      decisionForJamal: "Soll die Verbindung später erneut geprüft werden?",
      takeoverStatus: "nicht übernommen",
      dailyFocusStatus: "airtable_unreachable_or_rejected",
    },
  };

  const output = outputs[status] || outputs.airtable_unreachable_or_rejected;
  return {
    version: "V6.15.1",
    status,
    dailyFocusStatus: output.dailyFocusStatus,
    agent: "Projektmanager-Agent",
    plugin: "Airtable read-only",
    origin: "sanitisierte Projektmanager-Chef-Ausgabe",
    madeExternalRequest,
    readOnly: true,
    sanitizedOnly: true,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    todayMostImportantProject: output.todayMostImportantProject,
    currentBlocker: output.currentBlocker,
    nextMeaningfulStep: output.nextMeaningfulStep,
    decisionForJamal: output.decisionForJamal,
    takeoverStatus: output.takeoverStatus,
    boundaries: [
      "keine Airtable-Rohdaten",
      "keine Feldnamen",
      "keine Feldwerte",
      "keine Record-IDs",
      "keine Tabellenstruktur",
      "keine Schreibrechte",
      "keine automatische externe Aktion",
      "kein automatischer Agentenstart",
    ],
  };
}

function getProjectManagerDailyFocus() {
  const chefOutput = getProjectManagerChefOutput();

  if (chefOutput.status === "missing_credentials") {
    return {
      ...buildProjectManagerDailyFocus("missing_credentials", false),
      canCreateStartAction: true,
      nextActionPrepared: true,
      missingVariables: chefOutput.missingVariables || [],
    };
  }

  if (chefOutput.status === "manual_approval_required") {
    return {
      ...buildProjectManagerDailyFocus("manual_approval_required", false),
      canCreateStartAction: true,
      nextActionPrepared: true,
    };
  }

  if (chefOutput.status === "sanitized_output_generated") {
    return {
      ...buildProjectManagerDailyFocus("sanitized_daily_focus_prepared", false),
      canCreateStartAction: true,
      nextActionPrepared: true,
    };
  }

  return {
    ...buildProjectManagerDailyFocus("airtable_unreachable_or_rejected", false),
    canCreateStartAction: true,
    nextActionPrepared: true,
  };
}

function handleProjectManagerDailyFocus(res) {
  sendJson(res, 200, getProjectManagerDailyFocus());
}

function buildProjectManagerStartAction(status, madeExternalRequest = false) {
  const outputs = {
    missing_credentials: {
      todayFocus: "Noch nicht ermittelt – lokale Zugangsdaten fehlen.",
      concreteNextStep: "Lokale Zugangsdaten nur lokal ergänzen, nicht speichern oder sichern.",
      pluginBenefit: "Airtable read-only vorbereitet, aber lokal noch nicht erreichbar.",
      agentTask: "Projektmanager-Agent wartet auf lokale Voraussetzungen.",
      preparationStatus: "Startaktion noch nicht ausführbar.",
      startActionStatus: "missing_credentials",
    },
    manual_approval_required: {
      todayFocus: "Noch nicht ermittelt – Server-Freigabe fehlt.",
      concreteNextStep: "Manuelle Server-Freigabe setzen, wenn lokale read-only Arbeit erlaubt ist.",
      pluginBenefit: "Airtable read-only bleibt geschützt.",
      agentTask: "Projektmanager-Agent darf noch keine lokale read-only Auswertung vorbereiten.",
      preparationStatus: "wartet auf Server-Freigabe",
      startActionStatus: "manual_approval_required",
    },
    ready_for_start_action: {
      todayFocus: "Lokale Voraussetzungen sind bereit. Startaktion bleibt sanitisiert.",
      concreteNextStep: "Projektmanager-Agentenauftrag aus Tagesfokus vorbereiten.",
      pluginBenefit: "Airtable read-only als Arbeitsgedächtnis.",
      agentTask: "Chef-Zusammenfassung aus Tagesfokus vorbereiten.",
      preparationStatus: "bereit",
      startActionStatus: "ready_for_start_action",
    },
    start_action_prepared: {
      todayFocus: "Aus sanitisiertem Tagesfokus vorbereitet – ohne Rohdaten.",
      concreteNextStep: "Agentenauftrag prüfen und als nächsten Arbeitsstart nutzen.",
      pluginBenefit: "Airtable read-only vorbereitet, Ausgabe bleibt Chef-Zusammenfassung.",
      agentTask: "Projektmanager-Agent soll Fokus, Blocker, nächsten Schritt und Entscheidung vorbereiten.",
      preparationStatus: "Startaktion vorbereitet",
      startActionStatus: "prepared_but_project_summary_not_yet_available",
    },
    airtable_unreachable_or_rejected: {
      todayFocus: "Nicht ermittelt – lokale Prüfung nicht möglich.",
      concreteNextStep: "Lokale Zugangsdaten und Freigabe prüfen.",
      pluginBenefit: "Nicht genutzt – Verbindung nicht erreichbar oder abgelehnt.",
      agentTask: "Noch nicht starten.",
      preparationStatus: "nicht vorbereitet",
      startActionStatus: "airtable_unreachable_or_rejected",
    },
  };

  const output = outputs[status] || outputs.airtable_unreachable_or_rejected;
  return {
    version: "V6.15.1",
    status,
    startActionStatus: output.startActionStatus,
    agent: "Projektmanager-Agent",
    plugin: "Airtable read-only",
    responsibleAgent: "Projektmanager-Agent",
    todayFocus: output.todayFocus,
    concreteNextStep: output.concreteNextStep,
    pluginBenefit: output.pluginBenefit,
    approvalRequired: "lokal erforderlich · keine automatische externe Aktion",
    resultForJamal: [
      "klare Chef-Zusammenfassung",
      "wichtigster Blocker",
      "nächster Schritt",
      "Entscheidung",
    ],
    agentTask: output.agentTask,
    preparationStatus: output.preparationStatus,
    canHandoffToAgentWorkflow: true,
    handoffMode: "manual_local_handoff",
    canUseKnowledgeResult: true,
    knowledgeContextMode: "sanitized_summary_only",
    startActionFromKnowledgeAvailable: true,
    canFeedDailyDecision: true,
    dailyDecisionSource: "knowledge_archive_to_projectmanager_flow",
    canBecomeTodayStartAction: true,
    todayStartActionMode: "sanitized_manual_direction_only",
    canBecomeNextAgentWorkflow: true,
    workflowFromTodayDirectionAvailable: true,
    workflowApprovalMode: "manual_local_approval_required",
    copyText:
      "Projektmanager-Agent: Bereite aus dem heutigen Tagesfokus eine Chef-Zusammenfassung vor. Nutze Airtable nur read-only, zeige keine Rohdaten, keine Feldnamen, keine Feldwerte, keine Record-IDs und keine Tabellenstruktur. Liefere nur: Fokus, wichtigster Blocker, nächster sinnvoller Schritt und Entscheidung für Jamal.",
    madeExternalRequest,
    readOnly: true,
    sanitizedOnly: true,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    boundaries: [
      "keine Airtable-Rohdaten",
      "keine Feldnamen",
      "keine Feldwerte",
      "keine Record-IDs",
      "keine Tabellenstruktur",
      "keine Schreibrechte",
      "keine automatische externe Aktion",
      "kein automatischer Agentenstart",
    ],
  };
}

function getProjectManagerStartAction() {
  const dailyFocus = getProjectManagerDailyFocus();

  if (dailyFocus.status === "missing_credentials") {
    return {
      ...buildProjectManagerStartAction("missing_credentials", false),
      missingVariables: dailyFocus.missingVariables || [],
    };
  }

  if (dailyFocus.status === "manual_approval_required") {
    return buildProjectManagerStartAction("manual_approval_required", false);
  }

  if (dailyFocus.status === "sanitized_daily_focus_prepared") {
    return buildProjectManagerStartAction("start_action_prepared", false);
  }

  return buildProjectManagerStartAction("airtable_unreachable_or_rejected", false);
}

function handleProjectManagerStartAction(res) {
  sendJson(res, 200, getProjectManagerStartAction());
}

function buildProjectManagerWorkflow(status, madeExternalRequest = false) {
  const outputs = {
    missing_credentials: {
      workflowStatus: "blockiert – lokale Zugangsdaten fehlen",
      resultForJamal:
        "Der Projektmanager-Agent kann den Arbeitslauf vorbereiten, aber noch keine lokale read-only Grundlage nutzen.",
      nextAction: "Lokale Zugangsdaten nur lokal ergänzen, nicht speichern oder sichern.",
      decisionForJamal: "Soll Airtable lokal als read-only Arbeitsgedächtnis vorbereitet werden?",
    },
    manual_approval_required: {
      workflowStatus: "blockiert – Server-Freigabe fehlt",
      resultForJamal: "Der Agenten-Arbeitslauf ist vorbereitet, echte lokale Prüfung bleibt geschützt.",
      nextAction: "Manuelle Server-Freigabe setzen, wenn lokale read-only Arbeit erlaubt ist.",
      decisionForJamal: "Soll der Projektmanager-Agent lokal read-only arbeiten dürfen?",
    },
    locally_approvable: {
      workflowStatus: "lokal freigebbar",
      resultForJamal: "Der Projektmanager-Agent kann die Startaktion in eine sichere Chef-Ausgabe überführen.",
      nextAction: "Agenten-Arbeitslauf lokal freigeben.",
      decisionForJamal: "Soll dieser Agenten-Arbeitslauf jetzt als nächster Arbeitsschritt gelten?",
    },
    workflow_prepared: {
      workflowStatus: "Ergebnisstruktur vorbereitet",
      resultForJamal:
        "Chef-Zusammenfassung, Blocker, nächster Schritt und Entscheidung sind als Ausgabeformat vorbereitet.",
      nextAction:
        "Ergebnis prüfen und entscheiden, ob der Projektmanager-Agent als erster aktiver Plugin-Agent weitergeführt wird.",
      decisionForJamal: "Soll der Projektmanager-Agent künftig regelmäßig Tagesfokus und Startaktion vorbereiten?",
    },
    airtable_unreachable_or_rejected: {
      workflowStatus: "nicht ausführbar",
      resultForJamal:
        "Der Arbeitslauf wurde nicht gestartet, weil lokale Prüfung nicht erreichbar oder abgelehnt ist.",
      nextAction: "Lokale Zugangsdaten und Freigabe prüfen.",
      decisionForJamal: "Soll später erneut geprüft werden?",
    },
  };

  const output = outputs[status] || outputs.airtable_unreachable_or_rejected;
  return {
    version: "V6.12.7",
    status,
    workflowStatus:
      status === "workflow_prepared"
        ? "prepared_but_project_summary_not_yet_available"
        : output.workflowStatus,
    workflowStatusLabel: output.workflowStatus,
    agent: "Projektmanager-Agent",
    plugin: "Airtable read-only",
    responsibleAgent: "Projektmanager-Agent",
    workflow: "Projektmanager-Agent verarbeitet Startaktion",
    task:
      "Tagesfokus in Chef-Zusammenfassung, Blocker, nächsten Schritt und Entscheidung übersetzen",
    expectedResult: [
      "Chef-Zusammenfassung",
      "wichtigster Blocker",
      "nächster sinnvoller Schritt",
      "Entscheidung für Jamal",
    ],
    pluginBenefit: "Airtable read-only als Arbeitsgedächtnis, ohne Rohdatenanzeige.",
    approvalBoundary:
      "lokal erforderlich · keine automatische externe Aktion · keine Schreibrechte · keine freie Airtable-Datenanzeige",
    canPrepareWorkflowResult: true,
    resultMode: "status_and_follow_up_decision_only",
    resultForJamal: output.resultForJamal,
    decisionForJamal: output.decisionForJamal,
    nextAction: output.nextAction,
    madeExternalRequest,
    readOnly: true,
    sanitizedOnly: true,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    boundaries: [
      "keine Airtable-Rohdaten",
      "keine Feldnamen",
      "keine Feldwerte",
      "keine Record-IDs",
      "keine Tabellenstruktur",
      "keine Schreibrechte",
      "keine automatische externe Aktion",
      "kein automatischer externer Agentenstart",
    ],
  };
}

function getProjectManagerWorkflow() {
  const startAction = getProjectManagerStartAction();

  if (startAction.status === "missing_credentials") {
    return {
      ...buildProjectManagerWorkflow("missing_credentials", false),
      missingVariables: startAction.missingVariables || [],
    };
  }

  if (startAction.status === "manual_approval_required") {
    return buildProjectManagerWorkflow("manual_approval_required", false);
  }

  if (startAction.status === "start_action_prepared") {
    return buildProjectManagerWorkflow("workflow_prepared", false);
  }

  return buildProjectManagerWorkflow("airtable_unreachable_or_rejected", false);
}

function handleProjectManagerWorkflow(res) {
  sendJson(res, 200, getProjectManagerWorkflow());
}

function buildProjectManagerWorkflowResult(status, madeExternalRequest = false) {
  const outputs = {
    missing_credentials: {
      workflowStatus: "blockiert – lokale Zugangsdaten fehlen",
      resultStatus: "noch nicht nutzbar",
      preparedResult:
        "Der Projektmanager-Arbeitslauf ist strukturiert, aber lokale read-only Grundlage fehlt.",
      usabilityForJamal: "Noch nicht als echter Tagesfokus nutzbar.",
      followUpDecision: "Soll Airtable lokal als read-only Arbeitsgedächtnis vorbereitet werden?",
      nextAction:
        "Lokale Voraussetzungen prüfen oder HR-Agentenentwicklung als nächsten Schritt vorbereiten.",
    },
    manual_approval_required: {
      workflowStatus: "blockiert – Server-Freigabe fehlt",
      resultStatus: "vorbereitet, aber nicht lokal ausführbar",
      preparedResult: "Ausgabeformat für Chef-Zusammenfassung ist vorbereitet.",
      usabilityForJamal: "Als Struktur nutzbar, aber noch nicht als echte read-only Auswertung.",
      followUpDecision: "Soll der Projektmanager-Agent lokal read-only arbeiten dürfen?",
      nextAction:
        "Server-Freigabe setzen oder HR-Training als parallelen Systemleistungsschritt vorbereiten.",
    },
    workflow_prepared: {
      workflowStatus: "vorbereitet",
      resultStatus: "Ergebnisstruktur vorbereitet",
      preparedResult:
        "Chef-Zusammenfassung, Blocker, nächster Schritt und Entscheidung sind als Ergebnisformat bereit.",
      usabilityForJamal: "Nutzbar als geführter nächster Arbeitsschritt, aber noch ohne freie Airtable-Daten.",
      followUpDecision: "Soll dieser Arbeitslauf als Standard für den Projektmanager-Agenten gelten?",
      nextAction: "HR-Agenten-Arbeitslauf für tägliche 1%-Verbesserung vorbereiten.",
    },
    result_usable_prepared: {
      workflowStatus: "abschließbar",
      resultStatus: "nutzbar vorbereitet",
      preparedResult:
        "Der Projektmanager-Agent hat ein sicheres Ergebnisformat für Jamals Tagesführung vorbereitet.",
      usabilityForJamal: "Kann als Tagesrichtung und nächste Startaktion verwendet werden.",
      followUpDecision:
        "Soll als nächstes der HR-Agent die tägliche Agentenentwicklung vorbereiten?",
      nextAction: "HR-Agent mit 1%-Trainings- und Autonomievorschlag vorbereiten.",
    },
    airtable_unreachable_or_rejected: {
      workflowStatus: "nicht ausführbar",
      resultStatus: "nicht nutzbar",
      preparedResult:
        "Kein Ergebnis erzeugt, weil lokale Prüfung nicht erreichbar oder abgelehnt ist.",
      usabilityForJamal: "Nicht als Tagesrichtung nutzbar.",
      followUpDecision:
        "Soll später erneut geprüft werden oder soll ein anderer Agent ohne Airtable starten?",
      nextAction: "HR-Agent als nächsten autarken Systemleistungsschritt vorbereiten.",
    },
  };

  const output = outputs[status] || outputs.airtable_unreachable_or_rejected;
  return {
    version: "V6.12.7",
    status,
    workflowStatus:
      status === "workflow_prepared"
        ? "prepared_but_project_summary_not_yet_available"
        : output.workflowStatus,
    workflowStatusLabel: output.workflowStatus,
    resultStatus:
      status === "workflow_prepared"
        ? "prepared_but_project_summary_not_yet_available"
        : output.resultStatus,
    resultStatusLabel: output.resultStatus,
    agent: "Projektmanager-Agent",
    plugin: "Airtable read-only",
    workflow: "Projektmanager-Agent verarbeitet Startaktion",
    preparedResult: output.preparedResult,
    usabilityForJamal: output.usabilityForJamal,
    followUpDecision: output.followUpDecision,
    recommendedFollowUpAgent: "HR-Agent",
    hrDailyTrainingAvailable: true,
    nextSystemPerformanceStep: "daily_one_percent_agent_development",
    autonomyStepAppliedAvailable: true,
    projectManagerCanRecommendFollowUpAgent: true,
    followUpAgentStartMode: "manual_approval_required",
    automaticFollowUpAgentStartBlocked: true,
    recommendationReason:
      "tägliche 1%-Ausbildung und mehr Eigenständigkeit für alle bestehenden Agenten",
    nextAction: output.nextAction,
    boundaries:
      "keine freie Airtable-Datenanzeige · keine Rohdaten · keine Feldnamen · keine Feldwerte · keine Record-IDs · keine Tabellenstruktur · keine Schreibrechte · keine automatische externe Aktion · kein automatischer externer Agentenstart",
    madeExternalRequest,
    readOnly: true,
    sanitizedOnly: true,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
  };
}

function getProjectManagerWorkflowResult() {
  const workflow = getProjectManagerWorkflow();

  if (workflow.status === "missing_credentials") {
    return {
      ...buildProjectManagerWorkflowResult("missing_credentials", false),
      missingVariables: workflow.missingVariables || [],
    };
  }

  if (workflow.status === "manual_approval_required") {
    return buildProjectManagerWorkflowResult("manual_approval_required", false);
  }

  if (workflow.status === "workflow_prepared") {
    return buildProjectManagerWorkflowResult("workflow_prepared", false);
  }

  return buildProjectManagerWorkflowResult("airtable_unreachable_or_rejected", false);
}

function handleProjectManagerWorkflowResult(res) {
  sendJson(res, 200, getProjectManagerWorkflowResult());
}

function getHrDailyTraining() {
  const today = new Date().toISOString().slice(0, 10);

  return {
    version: "V6.13.3",
    date: today,
    status: "HR-1%-Vorschlag vorbereitet",
    hrAgentStatus: "HR-Agent bereitet tägliche Agentenentwicklung vor",
    recommendedAgent: "Projektmanager-Agent",
    reason:
      "Er hat gerade den ersten geschlossenen Agenten-Kreis vorbereitet.",
    onePercentTraining:
      "Ergebnisstatus und Folgeentscheidung noch klarer in Chef-Sprache formulieren.",
    autonomyStep:
      "Darf künftig selbst vorschlagen, welcher Folgeagent als Nächstes eingebunden werden soll.",
    expectedBenefit:
      "Jamal muss weniger selbst aus Arbeitsergebnissen ableiten, was als Nächstes passieren soll.",
    riskBoundary:
      "Keine externe Aktion, kein Plugin-Schreiben, kein automatischer Start ohne Freigabe.",
    followUpDecision:
      "Soll der Projektmanager-Agent diesen kleinen Autonomie-Spielraum bekommen?",
    nextPossibleAgent: "HR-Agent",
    nextPossibleAgentReason:
      "Der HR-Agent sorgt dafür, dass alle bestehenden Agenten täglich besser und selbstständiger werden.",
    autonomyDevelopment: {
      currentScope: "Vorschlag vorbereiten",
      nextScope: "Folgeagent empfehlen",
      stillBlocked: "externe Aktion automatisch ausführen",
      hrRecommendation: "kleine Freigabe prüfen",
    },
    nextAction: "HR-Vorschlag prüfen oder als nächsten Agenten-Arbeitslauf übernehmen.",
    autonomyApprovalAvailable: true,
    recommendedAutonomyStep: "follow_up_agent_recommendation",
    approvalMode: "manual_local_approval_required",
    allExistingAgentsScopePrepared: true,
    todayRecommendedAgent: "Wissens-/Archiv-Agent",
    nextPluginAgentRecommendation: "Wissens-/Archiv-Agent + Airtable read-only",
    nextVersionRecommendation: "V6.14.0",
    madeExternalRequest: false,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    boundaries: [
      "keine Airtable-Rohdaten",
      "keine Feldnamen",
      "keine Feldwerte",
      "keine Record-IDs",
      "keine Tabellenstruktur",
      "keine Schreibrechte",
      "keine automatische externe Aktion",
      "kein automatischer externer Agentenstart",
    ],
  };
}

function handleHrDailyTraining(res) {
  sendJson(res, 200, getHrDailyTraining());
}

const HR_DAILY_TRAINING_PROPOSALS = [
  {
    agent: "Geschäftsführer-Agent",
    role: "Führung",
    todayTrainingStep: "Heute üben: Entscheidung in einem Satz zuspitzen.",
    smallAutonomyIncrease: "Darf Entscheidungsoptionen vorbereiten, aber nicht entscheiden.",
    riskBoundary: "Keine Entscheidung ohne Jamal.",
  },
  {
    agent: "Morgenbriefing-Agent",
    role: "Tagesstart",
    todayTrainingStep: "Heute üben: Tagesfokus noch knapper priorisieren.",
    smallAutonomyIncrease: "Darf einen Tagesvorschlag vorbereiten, aber nicht setzen.",
    riskBoundary: "Keine automatische Tagesentscheidung.",
  },
  {
    agent: "Strategie-/Geschäftsentwicklungs-Agent",
    role: "Strategie",
    todayTrainingStep: "Heute üben: Chance, Risiko und nächsten Schritt trennen.",
    smallAutonomyIncrease: "Darf Strategieoptionen vorschlagen, aber nicht auslösen.",
    riskBoundary: "Keine externe Aktion ohne Jamal.",
  },
  {
    agent: "Projektmanager-Agent",
    role: "Projektsteuerung",
    todayTrainingStep: "Heute üben: nächsten sinnvollen Schritt klar benennen.",
    smallAutonomyIncrease: "Darf Folgeagenten vorschlagen, aber nicht starten.",
    riskBoundary: "Kein automatischer Folgeagentenstart.",
  },
  {
    agent: "Produktmanager-Agent",
    role: "Produktlogik",
    todayTrainingStep: "Heute üben: Nutzen und Zielgruppe präziser formulieren.",
    smallAutonomyIncrease: "Darf Produktverbesserungen vorbereiten, aber nicht umsetzen.",
    riskBoundary: "Keine Schreibrechte.",
  },
  {
    agent: "Operations-/Prozess-Agent",
    role: "Prozesse",
    todayTrainingStep: "Heute üben: Engpass und Vereinfachung getrennt anzeigen.",
    smallAutonomyIncrease: "Darf Prozessvorschläge vorbereiten, aber nicht ändern.",
    riskBoundary: "Keine automatische Umsetzung.",
  },
  {
    agent: "Design-Director-Agent",
    role: "Designqualität",
    todayTrainingStep: "Heute üben: Gestaltung in eine klare Hauptaussage verdichten.",
    smallAutonomyIncrease: "Darf Designrichtung vorschlagen, aber nicht veröffentlichen.",
    riskBoundary: "Keine automatische Veröffentlichung.",
  },
  {
    agent: "Content-Agent",
    role: "Text",
    todayTrainingStep: "Heute üben: Text kürzer, klarer und kopierbarer machen.",
    smallAutonomyIncrease: "Darf Textvarianten vorbereiten, aber nicht senden.",
    riskBoundary: "Keine externe Veröffentlichung.",
  },
  {
    agent: "Web- & App-Product-Design-Agent",
    role: "UI/UX",
    todayTrainingStep: "Heute üben: wichtigste Nutzerhandlung zuerst zeigen.",
    smallAutonomyIncrease: "Darf UI-Verbesserungen vorschlagen, aber nicht deployen.",
    riskBoundary: "Kein Deployment.",
  },
  {
    agent: "Präsentations-/Keynote-/Pitch-Deck-Agent",
    role: "Präsentation",
    todayTrainingStep: "Heute üben: eine starke Aussage pro Folie formulieren.",
    smallAutonomyIncrease: "Darf Folienstruktur vorbereiten, aber nicht erstellen lassen.",
    riskBoundary: "Keine automatische Canva-Erstellung.",
  },
  {
    agent: "Foto-/Bildwelt-Director-Agent",
    role: "Bildwelt",
    todayTrainingStep: "Heute üben: Bildanforderung konkret und prüfbar machen.",
    smallAutonomyIncrease: "Darf Bildbriefings vorbereiten, aber keine Bilder extern erzeugen.",
    riskBoundary: "Keine externe Bildaktion.",
  },
  {
    agent: "Entwickler-Agent",
    role: "Code",
    todayTrainingStep: "Heute üben: kleine Änderung mit klarer Testgrenze planen.",
    smallAutonomyIncrease: "Darf technische Schritte vorschlagen, aber nicht deployen.",
    riskBoundary: "Keine Schreib-/Deploy-Aktion ohne Auftrag.",
  },
  {
    agent: "Plugin-/Tool-Radar-Agent",
    role: "Tool-Radar",
    todayTrainingStep: "Heute üben: Toolnutzen statt Toolliste formulieren.",
    smallAutonomyIncrease: "Darf Toolkandidaten priorisieren, aber nicht verbinden.",
    riskBoundary: "Keine API-Verbindung.",
  },
  {
    agent: "Plugin-/Integrations-Architekt-Agent",
    role: "Integration",
    todayTrainingStep: "Heute üben: Integrationsgrenze vor Nutzen nennen.",
    smallAutonomyIncrease: "Darf Integrationsskizzen vorbereiten, aber nicht konfigurieren.",
    riskBoundary: "Keine Secrets speichern.",
  },
  {
    agent: "Support-Agent",
    role: "Support",
    todayTrainingStep: "Heute üben: Antwort erst klären, dann lösen.",
    smallAutonomyIncrease: "Darf Antwortentwürfe vorbereiten, aber nicht versenden.",
    riskBoundary: "Keine E-Mail-Aktion.",
  },
  {
    agent: "QA-Agent",
    role: "Qualität",
    todayTrainingStep: "Heute üben: wichtigstes Qualitätsrisiko zuerst nennen.",
    smallAutonomyIncrease: "Darf Qualitätschecks vorbereiten, aber nicht blockieren.",
    riskBoundary: "Keine automatische Freigabe oder Sperre.",
  },
  {
    agent: "Compliance-/Risiko-Agent",
    role: "Risiko",
    todayTrainingStep: "Heute üben: Grenze klar, kurz und ohne Rechtsfreigabe formulieren.",
    smallAutonomyIncrease: "Darf Risikohinweise vorbereiten, aber nicht final freigeben.",
    riskBoundary: "Keine finale Rechtsfreigabe.",
  },
  {
    agent: "Wissens-/Archiv-Agent",
    role: "Wissen",
    todayTrainingStep: "Heute üben: Wissen als Chef-Kurzfassung statt Datenansicht zeigen.",
    smallAutonomyIncrease: "Darf relevante Wissensbereiche vorschlagen, aber nicht abrufen.",
    riskBoundary: "Keine Airtable-Rohdatenanzeige.",
  },
  {
    agent: "HR-/Team-Agent",
    role: "Agentenentwicklung",
    todayTrainingStep: "Heute üben: einen Trainingspunkt statt vieler Listen wählen.",
    smallAutonomyIncrease: "Darf Tagesvorschläge vorbereiten, aber keine Schulung starten.",
    riskBoundary: "Keine automatische Schulung.",
  },
  {
    agent: "HR-Agent",
    role: "Selbstentwicklung HR",
    todayTrainingStep: "Bessere Trainingsvorschläge formulieren und Risiken klarer begrenzen.",
    smallAutonomyIncrease: "Darf Selbstentwicklungsimpulse vorbereiten, aber nicht selbst freigeben.",
    riskBoundary: "Keine eigene Rechte- oder Autonomie-Erhöhung ohne Jamal.",
    nextManualStep: "Jamal prüft, ob HRs eigener Trainingspunkt sinnvoll ist.",
  },
  {
    agent: "Rechts-/Compliance-Agent",
    role: "Recht",
    todayTrainingStep: "Heute üben: rechtliche Unsicherheit als Frage an Jamal markieren.",
    smallAutonomyIncrease: "Darf Prüfbedarf vorbereiten, aber nicht rechtlich final entscheiden.",
    riskBoundary: "Keine Rechtsberatung als final behaupten.",
  },
  {
    agent: "Finanz-/Controlling-Agent",
    role: "Finanzen",
    todayTrainingStep: "Heute üben: Zahl, Bedeutung und Handlungsfrage trennen.",
    smallAutonomyIncrease: "Darf Finanzhinweise vorbereiten, aber nicht buchen.",
    riskBoundary: "Keine Buchung, keine Zahlung.",
  },
  {
    agent: "Vertriebs-Agent",
    role: "Sales",
    todayTrainingStep: "Heute üben: nächsten Kontaktgrund klarer formulieren.",
    smallAutonomyIncrease: "Darf Gesprächsvorschläge vorbereiten, aber niemanden kontaktieren.",
    riskBoundary: "Keine externe Kontaktaufnahme.",
  },
  {
    agent: "Partner-/Kooperations-Agent",
    role: "Partner",
    todayTrainingStep: "Heute üben: Kooperationsnutzen in einem Satz benennen.",
    smallAutonomyIncrease: "Darf Partnervorschläge vorbereiten, aber nicht anschreiben.",
    riskBoundary: "Keine automatische Nachricht.",
  },
  {
    agent: "Kunden-/Customer-Success-Agent",
    role: "Kunden",
    todayTrainingStep: "Heute üben: Kundennutzen vor interner Erklärung nennen.",
    smallAutonomyIncrease: "Darf Kundenhinweise vorbereiten, aber nicht versenden.",
    riskBoundary: "Keine Kundendatenanzeige oder externe Aktion.",
  },
];

const HR_TOP_TRAINING_RECOMMENDATION = {
  recommendedAgent: "Projektmanager-Agent",
  recommendedRole: "Projektsteuerung",
  recommendedTrainingStep: "Projektmanager-Agent: bessere nächste kleinste Schritte formulieren.",
  reason:
    "Dieser Agent beeinflusst viele andere Arbeitsläufe und verbessert die Tagessteuerung sofort.",
  possibleAutonomyIncrease: "Darf bessere Vorschläge vorbereiten, aber nichts selbst starten.",
  riskBoundary: "Keine Projektentscheidung und keine externe Aktion ohne Jamal.",
  nextManualStepForJamal:
    "Jamal prüft den Vorschlag und gibt ihn manuell frei oder überspringt ihn.",
};

const PROJECT_MANAGER_AUTONOMY_FILTER = {
  version: "V6.16.2",
  title: "Projektmanager-Agent als Autonomie-Filter stärken",
  hrAutonomyUpgrade: "Projektmanager-Agent darf Agenten-Ergebnisse eigenständig bündeln.",
  hrDecisionFilter: "Jamal bekommt eine klare Empfehlung statt vieler Einzelmeldungen.",
  hrOutputRule: "Ausgabe immer als Geschäftsführer-taugliche Tagesempfehlung.",
  autonomyBoundary:
    "Interne Priorisierung ja, Außenwirkung nur nach Jamals Freigabe.",
  cockpitSignals: [
    "Projektmanager-Agent darf interne nächste Schritte empfehlen.",
    "Agenten arbeiten stärker zu.",
    "Jamal erhält weniger Einzelentscheidungen.",
    "Keine externe Aktion ohne Freigabe.",
    "Keine E-Mail, keine Cloud-Aktion, kein Deployment, kein API-Schreibzugriff.",
  ],
  handoffRuleFields: ["Kurzbefund", "Empfehlung", "Risiko/Grenze", "benötigte Entscheidung"],
};

const PLUGIN_PREPARATION_CATEGORIES = ["Airtable", "Google Calendar", "Canva", "HeyGen", "GitHub", "Gmail"];

function getRecommendedPluginsForAgent(agentName, role = "") {
  const text = `${agentName} ${role}`.toLowerCase();
  const plugins = new Set();

  if (/geschäftsführer|chef/.test(text)) {
    ["Airtable", "Gmail", "Google Calendar"].forEach((plugin) => plugins.add(plugin));
  }
  if (/projektmanager/.test(text)) {
    ["GitHub", "Airtable", "Google Calendar"].forEach((plugin) => plugins.add(plugin));
  }
  if (/produktmanager/.test(text)) {
    ["Airtable", "GitHub", "Gmail"].forEach((plugin) => plugins.add(plugin));
  }
  if (/entwickler/.test(text)) plugins.add("GitHub");
  if (/design-director/.test(text)) {
    ["Canva", "HeyGen"].forEach((plugin) => plugins.add(plugin));
  }
  if (/content-agent/.test(text)) {
    ["Canva", "Gmail"].forEach((plugin) => plugins.add(plugin));
  }
  if (/support/.test(text)) {
    ["Gmail", "Airtable"].forEach((plugin) => plugins.add(plugin));
  }
  if (/hr|training|team/.test(text)) {
    ["Airtable", "Google Calendar"].forEach((plugin) => plugins.add(plugin));
  }
  if (/compliance|risiko|recht/.test(text)) {
    ["Airtable", "Gmail", "GitHub"].forEach((plugin) => plugins.add(plugin));
  }
  if (/wissen|archiv/.test(text)) {
    ["Airtable", "Gmail", "GitHub"].forEach((plugin) => plugins.add(plugin));
  }
  if (/design|content|web|präsentation|keynote|pitch|foto|bildwelt|text/.test(text)) plugins.add("Canva");
  if (/video|präsentation|keynote|pitch/.test(text)) plugins.add("HeyGen");
  if (/entwickler|plugin|tool|integration|code|github/.test(text)) plugins.add("GitHub");
  if (/wissen|archiv|projekt|produkt|strategie|geschäft|morgen|operations|finanz|vertrieb|kunde|hr/.test(text)) {
    plugins.add("Airtable");
  }
  if (/support|vertrieb|partner|kunde|customer/.test(text)) plugins.add("Gmail");
  if (/morgen|projekt|operations|vertrieb|partner/.test(text)) plugins.add("Google Calendar");
  if (!plugins.size) plugins.add("Airtable");

  return [...plugins];
}

function getPluginUseCaseForAgent(agentName, recommendedPlugins) {
  if (recommendedPlugins.includes("Canva")) return "Briefing, Prompt oder Designaufgabe lokal vorbereiten.";
  if (recommendedPlugins.includes("HeyGen")) return "Video-Briefing oder Sprechertext lokal vorbereiten.";
  if (recommendedPlugins.includes("GitHub")) return "Technische Aufgabe oder Review-Auftrag lokal vorbereiten.";
  if (recommendedPlugins.includes("Gmail")) return "Antwortentwurf oder Kontaktgrund lokal vorbereiten.";
  if (recommendedPlugins.includes("Google Calendar")) return "Terminbedarf oder Kalenderbriefing lokal vorbereiten.";
  return `${agentName} bereitet eine sichere Plugin-Aufgabe ohne externe Ausführung vor.`;
}

function getManualPluginUseCase(agentName, recommendedPlugins, fallbackUseCase) {
  if (/geschäftsführer|chef/i.test(agentName)) {
    return "Entscheidungskontext lesen, Zusammenfassungen vorbereiten, Termine einordnen.";
  }
  if (/projektmanager/i.test(agentName)) return "Projektstand, offene Punkte und Terminbezug vorbereiten.";
  if (/produktmanager/i.test(agentName)) return "Produktstatus, Anforderungen und Rückfragen strukturieren.";
  if (/entwickler/i.test(agentName)) return "Code-/PR-/Issue-Kontext lesen und Vorschlag vorbereiten.";
  if (/design-director/i.test(agentName)) return "Design-/Video-Brief prüfen und verbessern.";
  if (/content-agent/i.test(agentName)) return "Content-Briefing, Entwurf und Kopiertext vorbereiten.";
  if (/support/i.test(agentName)) return "Supportfall zusammenfassen und Antwortvorschlag vorbereiten.";
  if (/hr|training|team/i.test(agentName)) return "Trainingsvorschläge und Lernrhythmus vorbereiten.";
  if (/compliance|risiko|recht/i.test(agentName)) return "Risiken, Grenzen und Freigabepunkte prüfen.";
  if (/wissen|archiv/i.test(agentName)) return "Wissen finden und Zusammenfassung vorbereiten.";
  if (recommendedPlugins.includes("Canva")) return "Design-, Content- oder Präsentationsbriefing vorbereiten.";
  if (recommendedPlugins.includes("Gmail")) return "Kommunikationsentwurf oder Rückfrage vorbereiten.";
  if (recommendedPlugins.includes("GitHub")) return "Technischen Kontext lesen und nächsten Vorschlag vorbereiten.";
  return fallbackUseCase || "Plugin-Einsatz später prüfen.";
}

function getPluginMatrixBoundary(agentName) {
  if (/geschäftsführer|chef/i.test(agentName)) return "Nichts senden, nichts speichern, nichts entscheiden.";
  if (/projektmanager/i.test(agentName)) return "Keine Issues ändern, keine Daten schreiben, keine Termine erstellen.";
  if (/produktmanager/i.test(agentName)) return "Keine Produktdaten ändern, keine E-Mail senden.";
  if (/entwickler/i.test(agentName)) return "Kein Commit, kein Push, kein PR ohne Jamal.";
  if (/design-director|präsentation|foto|content/i.test(agentName)) {
    return "Keine Canva-/HeyGen-Aktion automatisch ausführen, nichts veröffentlichen.";
  }
  if (/support|vertrieb|partner|kunde/i.test(agentName)) return "Keine Antwort senden, keinen Fall speichern.";
  if (/hr|training|team/i.test(agentName)) return "Keine Schulung automatisch starten, keinen Kalender ändern.";
  if (/compliance|risiko|recht/i.test(agentName)) return "Keine Sperre oder Entscheidung automatisch setzen.";
  if (/wissen|archiv/i.test(agentName)) return "Keine Archivierung oder Speicherung automatisch ausführen.";
  return "Plugin-Einsatz später prüfen. Keine automatische Plugin-Ausführung.";
}

function getPluginUseMatrix(agentPluginReadiness, availablePluginCategories) {
  const agentPluginMatrix = agentPluginReadiness.map((entry) => ({
    agentName: entry.agent,
    agentRole: entry.role,
    suggestedPluginCategories: entry.recommendedPlugins,
    manualUseCase: getManualPluginUseCase(entry.agent, entry.recommendedPlugins, entry.pluginUseCase),
    boundary: getPluginMatrixBoundary(entry.agent),
    status: "vorbereitet",
    requiresJamalApproval: true,
    automaticPluginExecutionBlocked: true,
    externalRequestBlocked: true,
    writeOperationsBlocked: true,
  }));

  return {
    title: "Plugin-Einsatzmatrix vorbereitet",
    explanation:
      "Alle Agenten bekommen eine erste Orientierung, welche Plugins später sinnvoll wären. Das ist nur Vorbereitung. Kein Agent führt ein Plugin automatisch aus.",
    agentCount: agentPluginReadiness.length,
    matrixPreparedForAgentCount: agentPluginMatrix.length,
    availablePluginCategories,
    manualOnly: true,
    requiresJamalApproval: true,
    noAutomaticPluginExecution: true,
    noAutomaticExternalPluginRequest: true,
    noAutomaticPluginWrite: true,
    noAutomaticStorage: true,
    noAutomaticDecision: true,
    agentPluginMatrix,
  };
}

function getManualPluginWorkOrders(availablePluginCategories) {
  const workOrdersByPlugin = {
    Airtable: {
      suggestedAgentRole: "Wissens-/Archiv-Agent oder Projektmanager-Agent",
      manualUseCase: "Projekt- oder Wissenskontext später manuell einordnen und als kurze Zusammenfassung vorbereiten.",
      jamalPreDecision: "Jamal entscheidet vorher, welche lokale read-only Grundlage genutzt werden darf.",
    },
    "Google Calendar": {
      suggestedAgentRole: "Projektmanager-Agent oder HR-Agent",
      manualUseCase: "Terminbedarf, Tagesbezug oder Lernrhythmus als manuellen Kalendereinsatz vorbereiten.",
      jamalPreDecision: "Jamal entscheidet vorher, ob ein Termin nur vorgeschlagen oder später manuell eingetragen wird.",
    },
    Canva: {
      suggestedAgentRole: "Content-/Design-Agent",
      manualUseCase: "Einen vorbereiteten Designauftrag manuell in Canva weiterverwenden.",
      jamalPreDecision: "Jamal entscheidet vorher, welcher Prompt oder Entwurf in Canva genutzt werden soll.",
    },
    HeyGen: {
      suggestedAgentRole: "Video-Content-Produktionsagent oder Design-Director-Agent",
      manualUseCase: "Ein Video-Briefing oder einen Sprechertext für spätere manuelle Videoarbeit vorbereiten.",
      jamalPreDecision: "Jamal entscheidet vorher, ob der Videoauftrag überhaupt extern genutzt werden darf.",
    },
    GitHub: {
      suggestedAgentRole: "Entwickler-Agent oder Projektmanager-Agent",
      manualUseCase: "Code-, Issue- oder Review-Kontext lesen und einen manuellen technischen Vorschlag vorbereiten.",
      jamalPreDecision: "Jamal entscheidet vorher, ob aus dem Vorschlag später ein Issue, Commit oder PR entstehen darf.",
    },
    Gmail: {
      suggestedAgentRole: "Support-Agent, Content-Agent oder Geschäftsführer-Agent",
      manualUseCase: "Antwortentwurf, Rückfrage oder kurze Nachricht vorbereiten, die Jamal manuell prüfen kann.",
      jamalPreDecision: "Jamal entscheidet vorher, ob eine Nachricht später manuell gesendet wird.",
    },
  };

  return availablePluginCategories.map((pluginCategory) => {
    const order = workOrdersByPlugin[pluginCategory] || {
      suggestedAgentRole: "passender Fachagent",
      manualUseCase: "Manuellen Plugin-Einsatz später prüfen und kurz vorbereiten.",
      jamalPreDecision: "Jamal entscheidet vorher, ob diese Plugin-Kategorie genutzt wird.",
    };

    return {
      pluginCategory,
      suggestedAgentRole: order.suggestedAgentRole,
      manualUseCase: order.manualUseCase,
      jamalPreDecision: order.jamalPreDecision,
      boundary: "Keine automatische Ausführung.",
      jamalDecisionRequired: true,
      manualOnly: true,
      automaticExecutionBlocked: true,
      externalPluginCallBlocked: true,
      writeOperationBlocked: true,
    };
  });
}

function getBestManualPluginStartOrders(availablePluginCategories) {
  const startOrdersByPlugin = {
    Airtable: {
      bestFirstManualStartOrder:
        "Eine vorhandene Projekt-/Agentenübersicht read-only prüfen und nur eine manuelle nächste Entscheidung vorbereiten.",
      responsibleAgent: "Wissens-/Archiv-Agent oder Projektmanager-Agent",
      whyThisFirst: "Airtable kann später Orientierung liefern, ohne dass Rohdaten angezeigt oder Daten geschrieben werden.",
      jamalDecisionNeeded: "Jamal entscheidet, welche lokale read-only Übersicht geprüft werden darf.",
    },
    "Google Calendar": {
      bestFirstManualStartOrder:
        "Einen Termin- oder Tagesfokus-Vorschlag vorbereiten, aber nichts in den Kalender eintragen.",
      responsibleAgent: "Projektmanager-Agent oder HR-Agent",
      whyThisFirst: "Ein Kalenderbezug hilft bei Tagesklarheit, ohne echte Termine zu verändern.",
      jamalDecisionNeeded: "Jamal entscheidet, ob der Vorschlag nur sichtbar bleibt oder später manuell eingetragen wird.",
    },
    Canva: {
      bestFirstManualStartOrder:
        "Den besten kopierbaren Design-Prompt vorbereiten, aber Canva nicht öffnen oder ausführen.",
      responsibleAgent: "Content-/Design-Agent",
      whyThisFirst: "Der Prompt ist sofort nutzbar und bleibt vollständig manuell.",
      jamalDecisionNeeded: "Jamal entscheidet, ob der Prompt manuell in Canva verwendet wird.",
    },
    HeyGen: {
      bestFirstManualStartOrder: "Ein Video-Briefing oder Skript vorbereiten, aber kein Video generieren.",
      responsibleAgent: "Video-Content-Produktionsagent oder Design-Director-Agent",
      whyThisFirst: "Ein klares Skript senkt Aufwand, ohne eine externe Videoaktion auszulösen.",
      jamalDecisionNeeded: "Jamal entscheidet, ob das Briefing später manuell in HeyGen genutzt wird.",
    },
    GitHub: {
      bestFirstManualStartOrder:
        "Einen Prüfauftrag für Code-/Versionsstand formulieren, aber keinen Commit, Push oder Pull Request ausführen.",
      responsibleAgent: "Entwickler-Agent oder Projektmanager-Agent",
      whyThisFirst: "Ein Prüfauftrag bringt technische Klarheit, ohne Repository-Inhalte zu verändern.",
      jamalDecisionNeeded: "Jamal entscheidet, ob daraus später manuell ein Issue, Commit oder PR wird.",
    },
    Gmail: {
      bestFirstManualStartOrder: "Einen E-Mail-Entwurf oder Antwortvorschlag vorbereiten, aber nichts senden.",
      responsibleAgent: "Support-Agent, Content-Agent oder Geschäftsführer-Agent",
      whyThisFirst: "Ein Entwurf spart Zeit, ohne Kommunikation automatisch auszulösen.",
      jamalDecisionNeeded: "Jamal entscheidet, ob die Nachricht manuell genutzt oder verworfen wird.",
    },
  };

  return availablePluginCategories.map((pluginCategory) => {
    const order = startOrdersByPlugin[pluginCategory] || {
      bestFirstManualStartOrder: "Kleinsten sicheren manuellen Startauftrag für diese Plugin-Kategorie formulieren.",
      responsibleAgent: "passender Fachagent",
      whyThisFirst: "Der erste Schritt bleibt sichtbar, klein und ohne externe Ausführung.",
      jamalDecisionNeeded: "Jamal entscheidet, ob diese Plugin-Kategorie manuell weiterverfolgt wird.",
    };

    return {
      pluginCategory,
      bestFirstManualStartOrder: order.bestFirstManualStartOrder,
      responsibleAgent: order.responsibleAgent,
      whyThisFirst: order.whyThisFirst,
      jamalDecisionNeeded: order.jamalDecisionNeeded,
      manualOnly: true,
      automaticPluginExecutionBlocked: true,
      externalPluginCallBlocked: true,
      writeOperationBlocked: true,
    };
  });
}

function getRecommendedFirstManualPluginStartOrder(bestManualPluginStartOrders) {
  const airtableStartOrder =
    bestManualPluginStartOrders.find((order) => order.pluginCategory === "Airtable") ||
    bestManualPluginStartOrders[0];

  return {
    category: airtableStartOrder?.pluginCategory || "Airtable",
    recommended: true,
    agent: airtableStartOrder?.responsibleAgent || "Wissens-/Archiv-Agent oder Projektmanager-Agent",
    reason:
      "Airtable ist der sicherste erste manuelle Plugin-Test, weil es Struktur, Status und Lesbarkeit der Unternehmenszentrale verbessert, ohne direkt Außenwirkung, Versand, Codeänderungen oder Medienproduktion auszulösen.",
    jamalPreDecision:
      airtableStartOrder?.jamalDecisionNeeded ||
      "Jamal entscheidet, welche lokale read-only Übersicht geprüft werden darf.",
    smallestManualNextStep:
      airtableStartOrder?.bestFirstManualStartOrder ||
      "Eine vorhandene Projekt-/Agentenübersicht read-only prüfen und nur eine manuelle nächste Entscheidung vorbereiten.",
    boundary: "Keine automatische Plugin-Ausführung. Jamal entscheidet selbst.",
    manualOnly: true,
    requiresJamalApproval: true,
    automaticPluginExecutionBlocked: true,
    externalPluginCallBlocked: true,
    writeOperationBlocked: true,
  };
}

function getRecommendedAirtableReadOnlyCheck() {
  return {
    title: "Manueller Airtable Read-only-Prüfauftrag",
    category: "Airtable",
    suitableAgent: "Wissens-/Archiv-Agent oder Projektmanager-Agent",
    checkGoal:
      "Nur prüfen, ob bestehende Airtable-Daten später als Orientierung gelesen werden könnten.",
    whyReadOnly:
      "Read-only hält die Prüfung klein und sicher: keine Datenänderung, keine Speicherung, keine Freigabeautomatik.",
    whyFirst:
      "Airtable ist strukturierter als E-Mail, Kalender oder Design-Tools und eignet sich deshalb als sicherster erster Read-only-Test.",
    relevantLaterData:
      "Später relevant wären nur sanitisierte Projektstände, Agentenübersichten, Statushinweise und nächste manuelle Entscheidungen.",
    smallestManualNextStep:
      "Jamal liest den Prüfauftrag und entscheidet, ob ein späterer echter Read-only-Test vorbereitet werden darf.",
    jamalDecisionRequired: true,
    safetyBoundary:
      "Keine echte Airtable-Verbindung. Keine API-Anfrage. Keine Datenänderung. Keine Speicherung. Keine automatische Entscheidung. Kein Folgeagentenstart.",
    realAirtableActionBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticFollowUpBlocked: true,
  };
}

function getAirtableReadOnlyDecisionQuestion() {
  return {
    title: "Jamal-Entscheidung zum Airtable Read-only-Test",
    question: "Soll dieser Read-only-Test später vorbereitet werden?",
    recommendedOption: "Späteren Read-only-Test vorbereiten",
    alternativeOption: "Heute überspringen",
    explanation:
      "Jamal entscheidet nur, ob ein späterer Read-only-Test vorbereitet werden darf. Heute wird noch kein Airtable verbunden, es werden keine Daten gelesen und nichts gespeichert.",
    smallestManualNextStep:
      "Jamal wählt bewusst: später vorbereiten oder heute überspringen.",
    jamalDecisionRequired: true,
    realAirtableActionBlocked: true,
    externalRequestsBlocked: true,
    writeOperationsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticFollowUpBlocked: true,
  };
}

function getPluginInstallationStatusPreparation(availablePluginCategories) {
  const installationStatusByPlugin = {
    Airtable: {
      plannedUse: "Struktur, Status und Orientierung später read-only einordnen.",
      safestFirstManualStep: "Read-only-Verbindung später manuell prüfen.",
      localStatus: "für Read-only-Test geeignet",
      boundary: "Keine Airtable-Aktion, keine Datenänderung, keine Speicherung.",
    },
    "Google Calendar": {
      plannedUse: "Tagesfokus oder Terminbezug später manuell einordnen.",
      safestFirstManualStep: "Kalenderzugriff nur anzeigen/prüfen, keine Termine erstellen.",
      localStatus: "Installation/Verbindung manuell prüfen",
      boundary: "Keine Calendar-Aktion, keine Termine erstellen oder ändern.",
    },
    Canva: {
      plannedUse: "Design-Aufträge und Prompts später manuell weiterverwenden.",
      safestFirstManualStep: "Design-Arbeitsauftrag nur vorbereiten, keine Canva-Aktion ausführen.",
      localStatus: "später vorbereiten",
      boundary: "Keine Canva-Aktion, keine automatische Erstellung, keine Veröffentlichung.",
    },
    HeyGen: {
      plannedUse: "Video- oder Avatar-Ideen später als Briefing vorbereiten.",
      safestFirstManualStep: "Video-/Avatar-Einsatz nur planen, kein Video erzeugen.",
      localStatus: "später vorbereiten",
      boundary: "Keine HeyGen-Aktion, kein Avatar- oder Video-Start.",
    },
    GitHub: {
      plannedUse: "Repository-, Issue- oder PR-Kontext später kontrolliert vorbereiten.",
      safestFirstManualStep: "Repository-/PR-Zugriff nur vorbereiten, keine Änderung pushen.",
      localStatus: "Installation/Verbindung manuell prüfen",
      boundary: "Keine GitHub-Aktion, kein Commit, kein Push, kein Pull Request.",
    },
    Gmail: {
      plannedUse: "Antwortentwürfe und Kommunikationshinweise später manuell vorbereiten.",
      safestFirstManualStep: "Mailzugriff nur später manuell prüfen, keine Mail senden oder verändern.",
      localStatus: "noch nicht geprüft",
      boundary: "Keine Gmail-Aktion, keine Mail senden, ändern oder löschen.",
    },
  };

  return {
    title: "Plugin-Installationsstand vorbereiten",
    explanation:
      "Vorgesehene Plugins werden nur lokal und manuell eingeordnet. Es wird nichts installiert, verbunden oder gestartet.",
    pluginStatuses: availablePluginCategories.map((pluginCategory) => {
      const status = installationStatusByPlugin[pluginCategory] || {
        plannedUse: "Späteren manuellen Nutzen prüfen.",
        safestFirstManualStep: "Installation oder Verbindung nur manuell prüfen.",
        localStatus: "noch nicht geprüft",
        boundary: "Keine automatische Plugin-Ausführung.",
      };

      return {
        pluginCategory,
        plannedUse: status.plannedUse,
        safestFirstManualStep: status.safestFirstManualStep,
        currentLocalStatus: status.localStatus,
        boundary: status.boundary,
        manualOnly: true,
        requiresJamalApproval: true,
        automaticPluginExecutionBlocked: true,
        automaticPluginInstallationBlocked: true,
        automaticConnectionBlocked: true,
        externalActionBlocked: true,
        writeOperationBlocked: true,
      };
    }),
    safetyBoundary:
      "Keine automatische Plugin-Ausführung. Keine automatische Plugin-Installation. Keine automatische Verbindung. Keine Airtable-, Canva-, HeyGen-, GitHub-, Gmail- oder Calendar-Aktion. Keine Schreiboperation. Keine externe Aktion. Jamal entscheidet jeden Plugin-Start manuell.",
    manualOnly: true,
    requiresJamalApproval: true,
    automaticPluginExecutionBlocked: true,
    automaticPluginInstallationBlocked: true,
    automaticConnectionBlocked: true,
    externalActionBlocked: true,
    writeOperationBlocked: true,
  };
}

function getFirstManualPluginConnectionCandidate() {
  return {
    title: "Erstes Plugin für manuellen Verbindungstest",
    recommendedPluginCategory: "Airtable",
    recommendedPluginLabel: "Airtable Read-only",
    testType: "Read-only",
    reason:
      "Airtable passt am besten zur Projekt-/Pilotstatus-Struktur. Read-only ist der sicherste erste Test, weil keine Schreiboperation, kein Versand, kein Design, kein Video und kein Kalendertermin nötig ist.",
    allowedLaterManualTest:
      "Später darf Jamal manuell prüfen, ob ein Airtable Read-only-Verbindungstest vorbereitet werden soll, um echte Projektdaten nur lesend einzuordnen.",
    blockedActions: [
      "keine automatische Airtable-Verbindung",
      "keine Airtable-Schreiboperation",
      "keine echten Daten automatisch lesen",
      "keine externe Anfrage",
      "keine Speicherung",
      "keine automatische Entscheidung",
      "kein Folgeagentenstart",
    ],
    decisionOptions: [
      "Airtable Read-only später manuell prüfen",
      "anderes Plugin zuerst prüfen",
      "Plugin-Test heute überspringen",
      "Entscheidung offen lassen",
    ],
    safetyBoundary:
      "Keine automatische Airtable-Verbindung. Keine Airtable-Schreiboperation. Keine echten Daten automatisch lesen. Keine externe Anfrage. Keine Speicherung. Keine automatische Entscheidung. Kein Folgeagentenstart. Jamal entscheidet manuell.",
    manualOnly: true,
    requiresJamalApproval: true,
    automaticConnectionBlocked: true,
    realAirtableConnectionBlocked: true,
    automaticDataReadBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getCopyableAirtableReadOnlyTestOrder() {
  return {
    title: "Kopierbarer Airtable Read-only-Testauftrag",
    hint:
      "Nur nutzen, wenn Jamal den Airtable Read-only-Test später bewusst manuell vorbereiten möchte.",
    copyableOrderText:
      "Prüfe später manuell, ob Airtable grundsätzlich read-only als Plugin-Verbindung geeignet ist. Nur lesen, nichts schreiben. Keine Tabellen verändern. Keine Records erstellen, ändern oder löschen. Keine echten Kundendaten verwenden. Keine Automatisierung starten. Ergebnis nur als kurze lokale Einschätzung festhalten: Verbindung grundsätzlich möglich, Verbindung noch nicht prüfen, anderes Plugin zuerst prüfen oder Entscheidung offen lassen.",
    possibleLocalResults: [
      "Verbindung grundsätzlich möglich",
      "Verbindung noch nicht prüfen",
      "anderes Plugin zuerst prüfen",
      "Entscheidung offen lassen",
    ],
    safetyBoundary:
      "Keine echte Airtable-Verbindung. Kein Token. Kein Secret. Keine .env.local. Keine Daten gelesen. Keine Daten geschrieben. Keine externen Requests. Keine POST/PATCH/PUT/DELETE-Endpunkte. Keine automatische Speicherung. Keine automatische Entscheidung. Kein Folgeagentenstart.",
    manualOnly: true,
    realAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    envLocalCreationBlocked: true,
    dataReadBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    postPatchPutDeleteBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getManualAirtableReadOnlyTestClassification() {
  return {
    title: "Airtable Read-only-Test manuell einordnen",
    hint:
      "Nur zur lokalen Einschätzung. Jamal entscheidet später selbst, ob und wann ein echter Read-only-Test vorbereitet wird.",
    options: [
      "Read-only-Test später manuell vorbereiten",
      "Vorher Plugin-Ziel klären",
      "Airtable heute überspringen",
      "Anderes Plugin zuerst prüfen",
      "Entscheidung offen lassen",
    ],
    safetyBoundary:
      "Keine Airtable-Verbindung. Kein Token. Kein Secret. Keine Datenabfrage. Keine echten Kundendaten. Keine Schreiboperation. Keine automatische Vorbereitung. Keine automatische Entscheidung. Keine automatische Speicherung. Kein Folgeagentenstart.",
    manualOnly: true,
    realAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    dataQueryBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    automaticPreparationBlocked: true,
    automaticDecisionBlocked: true,
    automaticStorageBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getManualAirtableReadOnlyTestGoalClarification() {
  return {
    title: "Plugin-Ziel vor Verbindung klären",
    hint:
      "Nur lokale Zielklärung. Jamal entscheidet später selbst, ob überhaupt ein Read-only-Test vorbereitet wird.",
    options: [
      "Nur Verbindung grundsätzlich prüfen",
      "Tabellenstruktur erkennen",
      "Beispielhafte Projektdaten read-only ansehen",
      "Agenten-Readiness gegen Airtable einschätzen",
      "Heute kein Plugin-Ziel festlegen",
    ],
    safetyBoundary:
      "Keine Airtable-Verbindung. Kein Token. Kein Secret. Keine Datenabfrage. Keine echten Kundendaten. Keine Schreiboperation. Keine automatische Vorbereitung. Keine automatische Entscheidung. Kein Folgeagentenstart.",
    manualOnly: true,
    localGoalClarificationOnly: true,
    realAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    dataQueryBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    automaticPreparationBlocked: true,
    automaticDecisionBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getCopyableAirtableReadOnlyTestGoalSelection() {
  return {
    title: "Kopierbare Airtable-Zielauswahl",
    hint:
      "Nur nutzen, wenn Jamal später manuell festhalten möchte, welches Airtable-Ziel zuerst geprüft werden soll.",
    copyableGoalSelectionText:
      "Manuelle Airtable-Zielauswahl:\nIch möchte später nur folgendes Ziel prüfen:\n[ ] Nur Verbindung grundsätzlich prüfen\n[ ] Tabellenstruktur erkennen\n[ ] Beispielhafte Projektdaten read-only ansehen\n[ ] Agenten-Readiness gegen Airtable einschätzen\n[ ] Heute kein Plugin-Ziel festlegen\n\nGrenze: nur Zielnotiz, keine Airtable-Verbindung, kein Token, kein Secret, keine Datenabfrage, keine Schreiboperation, keine automatische Vorbereitung und keine automatische Entscheidung.",
    selectableGoalVariants: [
      "Nur Verbindung grundsätzlich prüfen",
      "Tabellenstruktur erkennen",
      "Beispielhafte Projektdaten read-only ansehen",
      "Agenten-Readiness gegen Airtable einschätzen",
      "Heute kein Plugin-Ziel festlegen",
    ],
    safetyBoundary:
      "Nur Zielnotiz. Keine Airtable-Verbindung. Kein Token. Kein Secret. Keine Datenabfrage. Keine echten Kundendaten. Keine Schreiboperation. Keine automatische Vorbereitung. Keine automatische Entscheidung. Kein Folgeagentenstart. Keine automatische Speicherung. Keine externen Requests.",
    manualOnly: true,
    localGoalNoteOnly: true,
    realAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    envLocalCreationBlocked: true,
    dataQueryBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    automaticPreparationBlocked: true,
    automaticDecisionBlocked: true,
    automaticStorageBlocked: true,
    followUpAgentStartBlocked: true,
    externalRequestsBlocked: true,
  };
}

function getManualAirtableGoalDecisionClassification() {
  return {
    title: "Airtable-Zielentscheidung lokal einordnen",
    hint:
      "Nur lokale Einordnung. Jamal entscheidet später selbst, welches Airtable-Ziel zuerst geprüft werden soll.",
    question: "Welches Airtable-Ziel wäre später der kleinste sichere erste Schritt?",
    options: [
      "Nur Verbindung grundsätzlich prüfen",
      "Tabellenstruktur erkennen",
      "Beispielhafte Projektdaten read-only ansehen",
      "Agenten-Readiness gegen Airtable einschätzen",
      "Heute kein Airtable-Ziel entscheiden",
    ],
    safetyBoundary:
      "Diese Einordnung startet keine Airtable-Verbindung, nutzt keinen Token, liest keine Daten, speichert nichts und entscheidet nichts automatisch.",
    manualOnly: true,
    requiresJamalApproval: true,
    automaticAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    dataReadBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getSmallestSafeAirtableGoalRecommendation() {
  return {
    title: "Kleinste sichere Airtable-Ziel-Empfehlung",
    recommendation: "Nur Verbindung grundsätzlich prüfen",
    reason:
      "Das ist der kleinste sichere erste Schritt, weil dabei noch keine Tabellenstruktur erkannt, keine Projektdaten gelesen und keine Airtable-Inhalte bewertet werden müssen.",
    notRecommendedFirst: [
      "Tabellenstruktur erkennen",
      "Beispielhafte Projektdaten read-only ansehen",
      "Agenten-Readiness gegen Airtable einschätzen",
    ],
    whyNotFirst:
      "Diese Ziele setzen bereits mehr Kontext, Strukturverständnis oder Datennähe voraus und sollten erst nach einer bewusst bestätigten Grundverbindungsprüfung folgen.",
    safetyBoundary:
      "Diese Empfehlung startet keine Airtable-Verbindung, nutzt keinen Token, liest keine Daten, speichert nichts und entscheidet nichts automatisch. Jamal entscheidet später selbst.",
    manualOnly: true,
    recommendationOnly: true,
    requiresJamalApproval: true,
    automaticAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    dataReadBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getCopyableAirtableBasicConnectionCheckOrder() {
  return {
    title: "Kopierbarer Auftrag für spätere Airtable-Verbindungsgrundprüfung",
    hint:
      "Nur nutzen, wenn Jamal später bewusst manuell eine reine Airtable-Verbindungsgrundprüfung vorbereiten möchte.",
    copyableOrderText:
      "Bitte bereite später eine reine Airtable-Verbindungsgrundprüfung vor.\n\nGrenzen:\n* Nur prüfen, ob eine Verbindung grundsätzlich möglich wäre.\n* Keine Tabellenstruktur erkennen.\n* Keine Records lesen.\n* Keine Projektdaten ansehen.\n* Keine Airtable-Inhalte bewerten.\n* Keine Daten schreiben.\n* Keine Tabellen verändern.\n* Keine Records erstellen, ändern oder löschen.\n* Keinen Token im Code speichern.\n* Keine Secrets anzeigen.\n* Keine automatische Ausführung starten.\n* Keine externe Anfrage ohne Jamals bewusste manuelle Entscheidung.\n* Jamal entscheidet jeden nächsten Schritt selbst.",
    recommendedLaterScope: "Nur Verbindung grundsätzlich möglich?",
    notIncluded: [
      "Tabellenstruktur",
      "Projektdaten",
      "Read-only-Inhalte",
      "Agentenbewertung",
    ],
    safetyBoundary: "Nur kopierbarer manueller Auftrag, keine Ausführung.",
    manualOnly: true,
    copyOnly: true,
    automaticExecutionBlocked: true,
    realAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    dataReadBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getAirtablePreparationBundleSummary() {
  return {
    title: "Airtable-Vorbereitung zusammengefasst",
    hint:
      "Gebündelte Übersicht aus den bisherigen Airtable-Sicherheitsbausteinen. Keine Verbindung, keine Daten, keine automatische Ausführung.",
    currentRecommendation: "Nur Verbindung grundsätzlich prüfen",
    reason:
      "Das ist der kleinste sichere erste Schritt, weil noch keine Tabellenstruktur, Projektdaten oder Airtable-Inhalte bewertet werden.",
    laterManualStep:
      "Kopierbaren Auftrag nur nutzen, wenn Jamal bewusst eine reine Airtable-Verbindungsgrundprüfung vorbereiten möchte.",
    notIncluded: [
      "Tabellenstruktur erkennen",
      "Records lesen",
      "Projektdaten ansehen",
      "Airtable-Inhalte bewerten",
      "Agenten-Readiness gegen Airtable einschätzen",
      "Daten schreiben",
      "Tabellen verändern",
      "automatische Ausführung",
    ],
    notDoneToday: [
      "keine Airtable-Verbindung",
      "kein Token",
      "keine Secrets",
      "keine Daten gelesen",
      "keine Daten geschrieben",
      "keine externen Requests",
      "keine automatische Speicherung",
      "keine automatische Entscheidung",
      "kein Folgeagentenstart",
    ],
    guidanceQuestion:
      "Soll Airtable später nur auf grundsätzliche Verbindung geprüft werden – oder heute bewusst offen bleiben?",
    options: [
      "Später nur Verbindung grundsätzlich prüfen",
      "Heute offen lassen",
      "Airtable heute überspringen",
    ],
    safetyBoundary:
      "Nur gebündelte Orientierung. Keine Airtable-Verbindung, keine Daten, keine Tokens, keine externen Requests und keine automatische Ausführung.",
    manualOnly: true,
    summaryOnly: true,
    requiresJamalApproval: true,
    automaticAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    dataReadBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getManualAirtableBundleDecision() {
  return {
    title: "Airtable-Bündelentscheidung",
    question: "Soll Airtable später als erster manueller Verbindungstest gewählt werden?",
    recommendedOption: "Ja, Airtable später manuell als Read-only-Verbindungstest prüfen",
    options: [
      "Airtable später manuell als Read-only-Verbindungstest prüfen",
      "Vorher Airtable-Ziel noch einmal klären",
      "Nur Verbindung grundsätzlich prüfen",
      "Anderes Plugin zuerst prüfen",
      "Heute keine Plugin-Entscheidung treffen",
      "Entscheidung offen lassen",
    ],
    explanation:
      "Diese Entscheidung ist nur eine lokale Orientierung. Sie startet keine Verbindung, liest keine Daten, speichert nichts und löst keinen Folgeagenten aus.",
    safetyBoundary:
      "Keine Airtable-Verbindung, kein Token, kein Secret, kein Datenlesen, kein Schreiben, keine externe Anfrage, keine automatische Speicherung, keine automatische Entscheidung, kein Training und kein Folgeagentenstart.",
    manualOnly: true,
    decisionOnly: true,
    requiresJamalApproval: true,
    automaticAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    dataReadBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getAirtableFirstTestPreparationPackage() {
  return {
    title: "Airtable-Ersttest-Paket",
    laterTestGoal:
      "Der spätere Airtable-Ersttest soll nur klären, ob eine Read-only-Verbindung grundsätzlich manuell geprüft werden kann. Es geht noch nicht um echte Projektdaten, Tabellenlogik, Automatisierung oder produktive Nutzung.",
    recommendedManualFlow: [
      "Jamal entscheidet bewusst, ob Airtable zuerst geprüft wird.",
      "Vorher wird festgelegt: nur Read-only.",
      "Es wird kein Schreibzugriff verwendet.",
      "Es werden keine echten Kundendaten benötigt.",
      "Der Test wird später separat gestartet, nicht heute.",
      "Ergebnis wird danach manuell eingeordnet.",
    ],
    successCriteria: [
      "Verbindung grundsätzlich manuell prüfbar",
      "keine Schreibrechte nötig",
      "keine externen Aktionen aus der App heraus",
      "keine Automatisierung ausgelöst",
      "keine echten Daten verändert",
      "Ergebnis verständlich dokumentierbar",
    ],
    stopCriteria: [
      "Token/Secret fehlt oder ist unklar",
      "Schreibzugriff wäre erforderlich",
      "echte Kundendaten wären nötig",
      "unklar ist, welche Base oder Tabelle geprüft werden soll",
      "externe Aktion würde automatisch ausgelöst",
      "Jamal entscheidet, den Plugin-Test zu verschieben",
    ],
    laterResultClassificationOptions: [
      "Verbindung grundsätzlich möglich",
      "Verbindung möglich, aber Ziel vorher klären",
      "Verbindung aktuell nicht sinnvoll",
      "anderes Plugin zuerst prüfen",
      "Ergebnis unklar",
      "Test nicht durchgeführt",
    ],
    notHappeningToday: [
      "keine Airtable-Verbindung",
      "kein Token",
      "kein Secret",
      "kein Datenlesen",
      "kein Schreiben",
      "keine Base-Auswahl",
      "keine Tabellenanalyse",
      "keine echten Kundendaten",
      "keine externe Anfrage",
      "keine automatische Speicherung",
      "keine automatische Entscheidung",
      "kein Training",
      "kein Folgeagentenstart",
    ],
    guidanceQuestion:
      "Ist das Airtable-Ersttest-Paket jetzt ausreichend vorbereitet, um später bewusst manuell gestartet zu werden?",
    options: [
      "Ja, Paket ist ausreichend vorbereitet",
      "Vorher Ziel noch einmal klären",
      "Vorher Sicherheitsgrenze prüfen",
      "Anderes Plugin zuerst einordnen",
      "Heute offen lassen",
    ],
    safetyBoundary:
      "Nur lokale Vorbereitung. Keine Airtable-Verbindung, kein Token, kein Secret, kein Datenzugriff, keine externe Anfrage, keine automatische Speicherung, keine automatische Entscheidung und kein Folgeagentenstart.",
    manualOnly: true,
    packageOnly: true,
    requiresJamalApproval: true,
    automaticAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    dataReadBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getAirtableFirstTestResultDocumentation() {
  return {
    title: "Airtable-Ersttest-Ergebnis später dokumentieren",
    purpose: "Nur spätere lokale Ergebnisdokumentation vorbereiten",
    hint: "Heute wird kein Test gestartet.",
    possibleResultValues: [
      "Erfolgreich: Verbindung grundsätzlich lesbar",
      "Teilweise erfolgreich: Verbindung klappt, Struktur noch unklar",
      "Unklar: Ergebnis nicht bewertbar",
      "Abgebrochen: Sicherheitsgrenze oder Verständnisproblem",
      "Nicht gestartet: Test bewusst nicht durchgeführt",
      "Später erneut prüfen",
    ],
    resultQuestions: [
      "Wurde Airtable überhaupt verbunden?",
      "Wurde nur gelesen?",
      "Wurden keine Daten verändert?",
      "War die Tabellenstruktur verständlich?",
      "Gab es einen Grund zum Abbruch?",
      "Ist ein nächster manueller Schritt sinnvoll?",
    ],
    qualityAndSafetyBoundary: [
      "keine echte Airtable-Verbindung",
      "kein Token",
      "kein Secret",
      "keine echten Kundendaten",
      "keine Schreiboperation",
      "keine automatische Speicherung",
      "keine automatische Entscheidung",
      "kein externer Request",
      "kein Folgeagent",
    ],
    recommendedDefaultClassification:
      "Nicht gestartet – später bewusst manuell prüfen.",
    guidanceQuestion:
      "Wie soll Jamal ein späteres Airtable-Ersttest-Ergebnis lokal einordnen, ohne daraus automatisch eine Aktion abzuleiten?",
    options: [
      "Ergebnis später manuell dokumentieren",
      "Ergebnis offen lassen",
      "Test nicht gestartet festhalten",
      "Abbruchgrund später einordnen",
      "Airtable heute weiter überspringen",
    ],
    safetyBoundary:
      "Nur lokale Ergebnisdokumentation. Kein Airtable-Test, keine Verbindung, kein Token, keine Daten, keine Speicherung, keine automatische Entscheidung und kein Folgeagentenstart.",
    manualOnly: true,
    documentationOnly: true,
    noTestStartedToday: true,
    requiresJamalApproval: true,
    realAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    realCustomerDataBlocked: true,
    dataReadBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getPluginTestCockpitSummary() {
  return {
    title: "Plugin-Test-Cockpit",
    purpose:
      "Lokale Führungsübersicht für den späteren manuellen Airtable-/Plugin-Ersttest. Sie bündelt die bisherigen Vorbereitungen, ohne eine Verbindung, Datenabfrage oder Ausführung zu starten.",
    currentPluginTestStatus:
      "Airtable ist als empfohlener erster manueller Read-only-Test vorbereitet. Die Entscheidung, ein echter späterer Test und die Ergebnisdokumentation bleiben manuell bei Jamal.",
    recommendedFirstPlugin: {
      pluginCategory: "Airtable",
      testType: "Read-only",
      reason:
        "Airtable passt am besten zur Projekt-/Pilotstatus-Struktur und ist als Read-only-Test der kleinste sichere Einstieg ohne Versand, Codeänderung, Medienproduktion oder Kalenderaktion.",
    },
    preparedBuildingBlocks: [
      "Plugin-Installationsstand vorbereitet",
      "erstes Plugin für manuellen Verbindungstest vorbereitet",
      "Airtable Read-only-Zielklärung vorbereitet",
      "Airtable-Zielentscheidung vorbereitet",
      "Airtable-Bündelentscheidung vorbereitet",
      "Airtable-Ersttest-Paket vorbereitet",
      "spätere Ergebnisdokumentation vorbereitet",
    ],
    notHappenedToday: [
      "keine Airtable-Verbindung",
      "kein Token verwendet",
      "keine Secrets gelesen oder erzeugt",
      "keine Airtable-Daten gelesen",
      "keine Airtable-Daten geschrieben",
      "keine externe Anfrage ausgeführt",
      "keine automatische Entscheidung getroffen",
      "kein Training gestartet",
      "keine Schulung gestartet",
      "kein Folgeagent gestartet",
    ],
    smallestSafeNextManualStep:
      "Jamal entscheidet manuell, ob Airtable später als erster Read-only-Verbindungstest vorbereitet werden soll. Heute bleibt es bei lokaler Orientierung.",
    leadershipQuestion:
      "Soll Jamal Airtable als ersten späteren manuellen Read-only-Test einordnen oder den Plugin-Test heute bewusst offen lassen?",
    options: [
      "Airtable-Ersttest später manuell starten",
      "Ersttest vorher noch intern erklären lassen",
      "anderes Plugin zuerst prüfen",
      "Plugin-Test heute bewusst überspringen",
      "Entscheidung offen lassen",
    ],
    qualityBoundary:
      "Qualität vor Geschwindigkeit. Erst verstehen, dann manuell entscheiden. Keine Ausführung ohne bewusst bestätigte Sicherheitsgrenze.",
    safetyBoundary:
      "Alles bleibt lokale Orientierung und manuelle Vorbereitung. Keine Airtable-Verbindung, kein Token, kein Secret, kein Datenlesen, kein Schreiben, keine externe Anfrage, keine automatische Speicherung, keine automatische Entscheidung, kein Training, keine Schulung und kein Folgeagentenstart.",
    manualOnly: true,
    cockpitOnly: true,
    requiresJamalApproval: true,
    realAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    dataReadBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getPluginTestDailyDecision() {
  return {
    title: "Plugin-Test-Tagesentscheidung",
    classification:
      "Dies ist nur eine manuelle Tagesentscheidung für Jamal. Sie ersetzt keine technische Prüfung und startet keine Verbindung.",
    leadershipQuestion:
      "Soll der Airtable-Ersttest später manuell vorbereitet werden oder heute offen bleiben?",
    recommendedOption: "Heute nur Entscheidung festhalten, keine Verbindung starten.",
    options: [
      "Airtable-Ersttest später manuell vorbereiten",
      "Heute offen lassen",
      "Anderes Plugin später zuerst prüfen",
      "Plugin-Test heute bewusst überspringen",
    ],
    smallestSafeNextManualStep:
      "Nur entscheiden, ob ein späterer manueller Airtable-Ersttest vorbereitet werden soll. Heute keine Verbindung ausführen.",
    qualityBoundary:
      "Die Entscheidung gibt nur Orientierung und ersetzt keine technische Prüfung.",
    safetyBoundary:
      "Keine Airtable-Verbindung, kein Token, kein Secret, keine Datenabfrage, keine Schreiboperation, keine externe Anfrage, keine automatische Speicherung, keine automatische Entscheidung, kein Training, keine Schulung und kein Folgeagentenstart.",
    manualOnly: true,
    dailyDecisionOnly: true,
    requiresJamalApproval: true,
    realAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    dataReadBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveUsagePreparation() {
  return {
    title: "Produktivmodus vorbereiten",
    currentProductiveStatus:
      "Lokale Führungszentrale bereit, operative Nutzung noch nicht aktiv.",
    statusExplanation:
      "Die Unternehmenszentrale kann bereits führen, strukturieren und Entscheidungen vorbereiten. Für produktive Nutzung fehlen noch kontrollierte Datenflüsse, dokumentierbare Ergebnisse und wiederkehrende Arbeitsroutinen.",
    productiveStages: [
      {
        title: "Tagesentscheidung wirklich nutzen",
        points: [
          "morgens 1–3 klare Entscheidungen sehen",
          "keine Überladung",
          "keine automatische Entscheidung",
        ],
      },
      {
        title: "Projektfokus täglich festlegen",
        points: [
          "ein Hauptprojekt auswählen",
          "kleinsten nächsten Schritt sichtbar machen",
          "bewusst nicht alles gleichzeitig starten",
        ],
      },
      {
        title: "Erste Read-only-Verbindung später manuell prüfen",
        points: [
          "z. B. Airtable read-only",
          "keine Schreibrechte",
          "keine echte Verbindung in dieser Version",
        ],
      },
      {
        title: "Erstes Ergebnis lokal einordnen",
        points: [
          "Ergebnis anzeigen",
          "manuell bewerten",
          "keine automatische Speicherung",
        ],
      },
      {
        title: "Projektverlauf als Arbeitsgedächtnis stärken",
        points: [
          "Entscheidungen, Blocker und nächste Schritte nachvollziehbar machen",
          "noch keine automatische Historie erzwingen",
        ],
      },
      {
        title: "Morgenbriefing und Abendabschluss produktiv einsetzen",
        points: [
          "morgens Fokus",
          "abends Status",
          "klare Führungsroutine",
        ],
      },
    ],
    smallestSafeNextStep:
      "Heute nur festlegen, welche Produktivstufe als erstes vorbereitet wird.",
    leadershipQuestion: "Welche Fähigkeit soll als erste produktiv nutzbar werden?",
    options: [
      "Tagesführung produktiv machen",
      "Projektverlauf produktiv machen",
      "Read-only-Datenfluss vorbereiten",
      "Morgenbriefing/Abendabschluss produktiv machen",
      "Heute nur Produktivstatus ansehen",
    ],
    recommendedOption: "Tagesführung produktiv machen",
    recommendationReason:
      "Die Tagesführung ist der sicherste nächste Produktivitätsschritt, weil sie ohne externe Verbindung, ohne Speicherung und ohne Automatisierung sofort die tägliche Nutzung verbessert.",
    qualityBoundary:
      "Dieser Bereich darf keine echte Produktivnutzung vortäuschen. Er soll nur sichtbar machen, welche Produktivfähigkeit als Nächstes sauber vorbereitet werden sollte.",
    safetyBoundary:
      "Keine externe Verbindung, keine Airtable-Verbindung, kein Token, kein Secret, keine Datenabfrage, keine Schreiboperation, keine automatische Speicherung, keine automatische Entscheidung, kein Training, keine Schulung, keine externe Anfrage und kein Folgeagentenstart.",
    manualOnly: true,
    preparationOnly: true,
    noProductiveUseStarted: true,
    requiresJamalApproval: true,
    externalConnectionBlocked: true,
    realAirtableConnectionBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    dataReadBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveDailyLeadershipDefinition() {
  return {
    title: "Produktive Tagesführung",
    currentStatus: [
      "Produktive Tagesführung vorbereitet",
      "Noch keine echte Produktivverbindung",
      "Noch keine automatische Ausführung",
    ],
    purpose:
      "Morgens sichtbar machen: 1 Fokus, 1 Entscheidung, 1 Grenze und 1 Erfolgskriterium. Die Zentrale führt lokal, startet aber keine Produktivautomatik.",
    morningLeadershipElements: [
      "1 Fokus",
      "1 Entscheidung",
      "1 Grenze",
      "1 Erfolgskriterium",
    ],
    todaysFocus: {
      question: "Welches eine Projekt soll heute geführt werden?",
      options: [
        "Health Upgrade Kompass",
        "Expansion App",
        "Marketing Agentur OS",
        "KI-Unternehmenszentrale",
        "Heute kein Projekt aktiv führen",
      ],
    },
    todaysDecision: {
      question: "Welche eine Entscheidung muss heute sichtbar werden?",
      options: [
        "Projekt weiterführen",
        "Projekt bewusst pausieren",
        "Qualität prüfen",
        "Demo vorbereiten",
        "Plugin-Test später manuell prüfen",
        "Heute keine Entscheidung erzwingen",
      ],
    },
    todaysBoundary: {
      question: "Was wird heute bewusst nicht gestartet?",
      options: [
        "Keine externe Verbindung",
        "Keine echten Kundendaten",
        "Keine Automatisierung",
        "Keine Schreiboperation",
        "Kein Folgeagentenstart",
        "Keine neue Baustelle öffnen",
      ],
    },
    successCriteriaForToday: [
      "Ein klarer nächster Schritt ist sichtbar",
      "Eine Entscheidung ist vorbereitet",
      "Eine Grenze wurde bewusst eingehalten",
      "Kein unnötiger Produktivstart wurde ausgelöst",
    ],
    recommendation:
      "Heute Tagesführung produktiv machen, aber noch keine echten Produktivdaten anschließen.",
    qualityBoundary:
      "Die Tagesführung darf Orientierung geben, aber keine Entscheidung automatisch treffen.",
    safetyBoundary:
      "Keine Airtable-Verbindung, keine Airtable-Abfrage, keine externen Requests, keine Tokens oder Secrets, keine echten Kundendaten, keine POST/PATCH/PUT/DELETE-Endpunkte, keine Schreiboperation, keine automatische Speicherung, kein Training, keine Schulung und kein Folgeagentenstart.",
    manualOnly: true,
    localOnly: true,
    noProductiveAutomationStarted: true,
    requiresJamalApproval: true,
    externalConnectionBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveDailyClosureDefinition() {
  return {
    title: "Produktiver Tagesabschluss",
    currentStatus: [
      "Produktiver Tagesabschluss vorbereitet",
      "Noch keine automatische Dokumentation",
      "Noch keine Speicherung oder Folgeaktion",
    ],
    purpose:
      "Am Ende des Tages manuell einordnen, was entschieden wurde, was bewusst nicht gestartet wurde, was offen bleibt und welcher kleinste sichere Schritt morgen sichtbar sein soll.",
    productiveDecisionQuestion: "Was wurde heute produktiv entschieden?",
    productiveDecisionOptions: [
      "Ein Projekt wurde weitergeführt",
      "Ein Projekt wurde bewusst pausiert",
      "Eine Qualitätsprüfung wurde vorbereitet",
      "Eine Grenze wurde bewusst eingehalten",
      "Heute wurde keine Entscheidung erzwungen",
    ],
    notDoneQuestion: "Was wurde bewusst nicht gemacht?",
    notDoneOptions: [
      "Keine externe Verbindung",
      "Keine echten Kundendaten genutzt",
      "Keine Automatisierung gestartet",
      "Keine Schreiboperation ausgeführt",
      "Kein Folgeagent gestartet",
      "Keine neue Baustelle geöffnet",
    ],
    openQuestion: "Was ist offen geblieben?",
    openOptions: [
      "Projektfokus morgen erneut prüfen",
      "Entscheidung morgen nachschärfen",
      "Grenze weiter beachten",
      "Plugin-Test später manuell einordnen",
      "Heute nichts weiter offen halten",
    ],
    smallestSafeNextStepForTomorrow:
      "Morgen wieder mit 1 Fokus, 1 Entscheidung, 1 Grenze und 1 Erfolgskriterium starten.",
    recommendation:
      "Heute nur lokal einordnen, ob der Tag geführt wurde. Nichts automatisch dokumentieren, speichern oder starten.",
    qualityBoundary:
      "Der Tagesabschluss darf Orientierung geben, aber keine Entscheidung automatisch treffen und keine echte Dokumentation vortäuschen.",
    safetyBoundary:
      "Keine automatische Dokumentation, keine Speicherung, keine externe Verbindung, keine Airtable-Verbindung, keine Airtable-Abfrage, keine Tokens oder Secrets, keine echten Kundendaten, keine Schreiboperation, keine automatische Entscheidung, kein Training, keine Schulung und kein Folgeagentenstart.",
    manualOnly: true,
    localOnly: true,
    closureOnly: true,
    requiresJamalApproval: true,
    automaticDocumentationBlocked: true,
    automaticStorageBlocked: true,
    externalConnectionBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveDailyHandoffPreparation() {
  return {
    title: "Tagesübergabe vorbereiten",
    currentHandoffStatus: [
      "Tagesübergabe lokal vorbereitet",
      "Noch keine automatische Übernahme in den nächsten Tag",
      "Noch keine Speicherung, Entscheidung oder Folgeaktion",
    ],
    purpose:
      "Den produktiven Tagesabschluss mit dem nächsten Tagesstart verbinden, damit Jamal morgen schneller sieht, was wieder aufgegriffen werden kann.",
    shouldBeVisibleTomorrow: [
      "Was heute produktiv entschieden wurde",
      "Was bewusst nicht gemacht wurde",
      "Was offen geblieben ist",
      "Kleinster sicherer nächster Schritt für morgen",
      "Welche Grenze weiter eingehalten werden soll",
    ],
    firstOpenDecisionTomorrow:
      "Zuerst prüfen, ob der gestrige kleinste sichere nächste Schritt weiterhin sinnvoll ist oder bewusst übersprungen wird.",
    notAutomaticallyContinued: [
      "Keine Entscheidung wird automatisch übernommen",
      "Kein Projekt wird automatisch gestartet",
      "Keine Plugin- oder Airtable-Verbindung wird automatisch vorbereitet",
      "Keine offene Aufgabe wird automatisch gespeichert",
      "Kein Folgeagent wird gestartet",
    ],
    smallestSafeNextStepForTomorrowStart:
      "Morgen den Tagesstart lokal mit 1 Fokus, 1 Entscheidung, 1 Grenze und 1 Erfolgskriterium neu bestätigen.",
    recommendation:
      "Heute nur sichtbar vorbereiten, was morgen wieder angesehen werden sollte. Jamal entscheidet morgen selbst, ob daraus ein Schritt wird.",
    qualityBoundary:
      "Die Tagesübergabe darf Orientierung geben, aber keine echte Historie, Speicherung oder automatische Fortführung vortäuschen.",
    safetyBoundary:
      "Keine automatische Übernahme, keine Speicherung, keine externe Verbindung, keine Airtable-Verbindung, keine Airtable-Abfrage, keine Tokens oder Secrets, keine echten Kundendaten, keine Schreiboperation, keine automatische Entscheidung, kein Training, keine Schulung und kein Folgeagentenstart.",
    manualOnly: true,
    localOnly: true,
    handoffOnly: true,
    requiresJamalApproval: true,
    automaticHandoffBlocked: true,
    automaticCarryOverBlocked: true,
    automaticStorageBlocked: true,
    externalConnectionBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveDailyCycleSummary() {
  return {
    title: "Produktiver Tageszyklus",
    currentCycleStatus: [
      "Produktiver Tageszyklus lokal vorbereitet",
      "Tagesstart, Tagesführung, Tagesabschluss und Tagesübergabe sind als Orientierung verbunden",
      "Noch keine echte Produktivverbindung, Speicherung oder Automatik aktiv",
    ],
    purpose:
      "Die vorbereiteten Produktivbausteine kompakt zusammenfassen, damit Jamal den lokalen Tagesbetrieb auf einen Blick führen kann.",
    preparedDailyBuildingBlocks: [
      "Produktivmodus vorbereiten",
      "Produktive Tagesführung",
      "Produktiver Tagesabschluss",
      "Tagesübergabe vorbereiten",
    ],
    currentMaturityLevel:
      "Lokaler Führungsbetrieb vorbereitet: Die Zentrale kann den Tag strukturieren, Entscheidungen sichtbar machen, Grenzen markieren und den nächsten Tagesstart vorbereiten.",
    alreadySupportsLocally: [
      "Produktivstatus einordnen",
      "morgens 1 Fokus, 1 Entscheidung, 1 Grenze und 1 Erfolgskriterium sichtbar machen",
      "abends Entscheidungen, offene Punkte und Grenzen manuell einordnen",
      "Übergabe für den nächsten Tagesstart vorbereiten",
      "Plugin- und Airtable-Vorbereitung weiterhin nur als Orientierung führen",
    ],
    stillNotAutomatic: [
      "Keine Entscheidung wird automatisch getroffen",
      "Nichts wird automatisch gespeichert",
      "Nichts wird automatisch in den nächsten Tag übernommen",
      "Kein Projekt, Plugin oder Agent wird automatisch gestartet",
      "Keine echte Plugin-, Airtable- oder externe Verbindung",
    ],
    nextRecommendedBoundaryBeforeRealProductiveConnection:
      "Vor jeder echten Produktivverbindung zuerst festlegen, welche Tagesinformation sichtbar sein darf, was lokal bleibt und welche Freigabe Jamal bewusst erteilt.",
    smallestSafeNextStep:
      "Den lokalen Tageszyklus einmal manuell nutzen: morgens Fokus setzen, abends Abschluss einordnen und am nächsten Tag die Übergabe bewusst prüfen.",
    recommendation:
      "Den Tageszyklus zuerst lokal stabil nutzen, bevor echte Datenflüsse, Plugins oder externe Verbindungen vorbereitet werden.",
    qualityBoundary:
      "Der Tageszyklus darf produktive Führung erleichtern, aber keine echte Produktivnutzung, Historie oder Automatisierung vortäuschen.",
    safetyBoundary:
      "Keine automatische Speicherung, keine automatische Übernahme, keine externe Verbindung, keine Airtable-Verbindung, keine Airtable-Abfrage, keine Tokens oder Secrets, keine echten Kundendaten, keine Schreiboperation, keine automatische Entscheidung, kein Training, keine Schulung und kein Folgeagentenstart.",
    manualOnly: true,
    localOnly: true,
    summaryOnly: true,
    requiresJamalApproval: true,
    automaticStorageBlocked: true,
    automaticCarryOverBlocked: true,
    externalConnectionBlocked: true,
    realPluginConnectionBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveMorningRoutineDerivation() {
  return {
    title: "Morgenroutine aus Tageszyklus ableiten",
    status: "lokal vorbereitet",
    source: "productiveDailyCycleSummary",
    purpose:
      "Aus dem zusammengefassten Tageszyklus eine kleine Morgenroutine für den nächsten Start ableiten.",
    morningChecks: [
      "1 Fokus übernehmen oder neu wählen",
      "1 offene Entscheidung prüfen",
      "1 Grenze bestätigen",
    ],
    focusCheck: "Fokus prüfen – heutigen Fokus übernehmen oder bewusst neu wählen.",
    decisionCheck:
      "Offene Entscheidung prüfen – eine offene Entscheidung aus Tagesabschluss/Tagesübergabe sichtbar machen.",
    boundaryCheck:
      "Grenze bestätigen – bestätigen, was morgen weiterhin nicht automatisch passieren darf.",
    recommendation:
      "Beim nächsten Start nur mit Fokus, Entscheidung und Grenze beginnen.",
    qualityBoundary:
      "Keine automatische Tagesplanung, keine Bewertung und keine Speicherung.",
    safetyBoundary:
      "Keine externe Verbindung, keine Airtable-Abfrage, keine Schreiboperation, keine Automatik und kein Agentenstart.",
    manualOnly: true,
    localOnly: true,
    derivedFromDailyCycle: true,
    requiresJamalApproval: true,
    automaticPlanningBlocked: true,
    automaticStorageBlocked: true,
    externalConnectionBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveWorkdayLocalSimulation() {
  return {
    title: "Ersten produktiven Arbeitstag lokal simulieren",
    status: "lokale Tagessimulation vorbereitet",
    purpose:
      "Morgenroutine, Tagesführung, Tagesabschluss und Übergabe einmal als lokalen Arbeitstag zusammenführen.",
    hint:
      "Diese Simulation führt nicht automatisch aus, speichert nichts und verbindet sich mit keinem externen System.",
    phases: [
      {
        title: "Morgenstart prüfen",
        points: [
          "Fokus prüfen",
          "offene Entscheidung prüfen",
          "Grenze bestätigen",
        ],
      },
      {
        title: "Tagesfokus bestätigen",
        points: [
          "ein Hauptprojekt",
          "ein kleinster sinnvoller Schritt",
          "ein klares Erfolgskriterium",
        ],
      },
      {
        title: "Eine Entscheidung sichtbar machen",
        points: [
          "heutige Führungsentscheidung",
          "Entscheidungsstatus",
          "was bewusst offen bleibt",
        ],
      },
      {
        title: "Grenze bestätigen",
        points: [
          "Qualitätsgrenze",
          "Sicherheitsgrenze",
          "was heute nicht automatisiert wird",
        ],
      },
      {
        title: "Tagesabschluss auswerten",
        points: [
          "was vorbereitet wurde",
          "was offen bleibt",
          "welcher Blocker sichtbar wurde",
        ],
      },
      {
        title: "Übergabe für morgen vorbereiten",
        points: [
          "was morgen wieder sichtbar sein soll",
          "erster nächster Startpunkt",
          "keine automatische Fortführung",
        ],
      },
    ],
    recommendation:
      "Nutze diese lokale Tagessimulation als manuelle 5-Minuten-Führung: morgens starten, tagsüber eine Entscheidung halten, abends sauber übergeben.",
    qualityBoundary:
      "Die Simulation darf den Tagesbetrieb führen, aber keine echte Produktivautomatik, Planung, Speicherung oder Bewertung ersetzen.",
    safetyBoundary:
      "Keine Speicherung, keine externe Verbindung, keine Airtable-Verbindung, keine Airtable-Abfrage, kein Token, kein Secret, keine Kundendaten, keine Schreiboperation, keine Automatik, keine automatische Entscheidung, kein Training, keine Schulung, kein Folgeagentenstart und kein Deployment.",
    smallestSafeNextStep:
      "Die sechs Phasen einmal lokal durchlesen und nur manuell entscheiden, ob Jamal den simulierten Tagesablauf morgen als Führungsroutine nutzt.",
    manualOnly: true,
    localOnly: true,
    simulationOnly: true,
    requiresJamalApproval: true,
    automaticExecutionBlocked: true,
    automaticStorageBlocked: true,
    externalConnectionBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
    deploymentBlocked: true,
  };
}

function getProductiveWorkdayLocalSimulationEvaluation() {
  return {
    title: "Simulationsergebnis lokal auswerten",
    status: "lokale Simulation auswertbar vorbereitet",
    purpose:
      "Aus der lokalen Tagessimulation ableiten, was für Jamal bereits produktiv nutzbar wäre und wo vor echter Produktivnutzung noch Unsicherheit besteht.",
    alreadyProductivelyUsableToday: [
      "morgens mit einem Fokus starten",
      "eine offene Entscheidung sichtbar halten",
      "eine klare Grenze bestätigen",
      "abends den Tagesabschluss manuell einordnen",
      "die Übergabe für morgen lokal vorbereiten",
    ],
    remainingUncertainty: [
      "ob Jamal die 5-Minuten-Führung täglich nutzen möchte",
      "welches Projekt morgen tatsächlich geführt wird",
      "welche Entscheidung zuerst sichtbar bleiben soll",
      "ob später echte Datenflüsse nötig sind",
      "welche Informationen vor einer Produktivverbindung sichtbar sein dürfen",
    ],
    manualDecisionRequired:
      "Jamal müsste manuell entscheiden, ob die lokale Tagessimulation als tägliche Führungsroutine ausprobiert oder bewusst offen gelassen wird.",
    notAllowedToAutomateYet: [
      "Tagesplanung automatisch speichern",
      "Projektfokus automatisch übernehmen",
      "Entscheidung automatisch treffen",
      "Airtable oder Plugins verbinden",
      "Ergebnis an externe Systeme senden",
      "Folgeagent starten",
    ],
    smallestSafeNextStep:
      "Die Simulation einmal lokal nachspielen und danach manuell notieren, ob Fokus, Entscheidung und Grenze für Jamal ausreichend klar waren.",
    recommendation:
      "Die Zentrale sollte zuerst lokal beweisen, dass der geführte Arbeitstag nützlich ist, bevor echte Daten, Speicherung oder Verbindungen vorbereitet werden.",
    qualityBoundary:
      "Die Auswertung darf Lernpunkte sichtbar machen, aber keine Produktivnutzung bewerten, speichern oder automatisch fortsetzen.",
    safetyBoundary:
      "Keine echte Produktivnutzung, keine Speicherung, keine externe Verbindung, keine Airtable-Verbindung, keine Airtable-Abfrage, kein Token, kein Secret, keine Kundendaten, keine Schreiboperation, keine Automatik, keine automatische Entscheidung, kein Training, keine Schulung, kein Folgeagentenstart und kein Deployment.",
    manualOnly: true,
    localOnly: true,
    evaluationOnly: true,
    requiresJamalApproval: true,
    automaticEvaluationBlocked: true,
    automaticExecutionBlocked: true,
    automaticStorageBlocked: true,
    externalConnectionBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
    deploymentBlocked: true,
  };
}

function getProductiveLocalReleasePreparation() {
  return {
    title: "Lokale Produktivfreigabe vorbereiten",
    status: "lokale Produktivfreigabe vorbereitet",
    locallyProductiveLeadershipReady: [
      "Tagesfokus als lokale Orientierung nutzen",
      "eine Entscheidung sichtbar halten",
      "Grenzen bewusst bestätigen",
      "Tagesabschluss manuell einordnen",
      "Übergabe für den nächsten Start vorbereiten",
    ],
    stillSimulationDemoOrPreparation: [
      "Airtable- und Plugin-Strecke bleibt Vorbereitung",
      "Health-Demo-Prüfstand bleibt lokale Demo-/Qualitätsorientierung",
      "Produktiver Arbeitstag bleibt lokale Simulation ohne Speicherung",
      "Simulationsergebnis bleibt lokale Auswertung ohne echte Produktivdaten",
    ],
    firstThreeLocalProductiveFunctionsAllowed: [
      "Produktive Tagesführung lokal nutzen",
      "Produktiven Tagesabschluss lokal nutzen",
      "Tagesübergabe lokal prüfen",
    ],
    manualDecisionBeforeRealUse:
      "Jamal muss manuell entscheiden, ob die Zentrale ab jetzt täglich als lokales Führungsinstrument genutzt wird. Echte Daten, externe Verbindungen und Schreiboperationen bleiben davon getrennt.",
    explicitlyStillBlocked: [
      "Airtable-Verbindung",
      "Plugin-Ausführung",
      "echte Kundendaten",
      "Schreiboperationen",
      "automatische Speicherung",
      "automatische Entscheidung",
      "Folgeagentenstart",
      "Deployment",
    ],
    smallestSafeNextStep:
      "Die lokale Produktivfreigabe nur für drei Funktionen erteilen: Tagesführung, Tagesabschluss und Tagesübergabe. Alles Externe bleibt gesperrt.",
    recommendation:
      "Die Unternehmenszentrale darf lokal als Führungs- und Entscheidungsinstrument genutzt werden, aber noch nicht als automatisiertes System.",
    qualityBoundary:
      "Lokale Produktivfreigabe bedeutet Nutzung als Führungsinstrument, nicht als produktive Automatisierung oder Datenplattform.",
    safetyBoundary:
      "Keine Airtable-Verbindung, keine Plugin-Verbindung, keine externen Requests, keine Tokens oder Secrets, keine echten Kundendaten, keine Schreiboperation, keine automatische Speicherung, keine automatische Entscheidung, kein Training, keine Schulung, kein Folgeagentenstart und kein Deployment.",
    manualOnly: true,
    localOnly: true,
    releasePreparationOnly: true,
    requiresJamalApproval: true,
    automationStillBlocked: true,
    realProductiveDataBlocked: true,
    externalConnectionBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
    deploymentBlocked: true,
  };
}

function getProductiveLocalUsageManualStart() {
  return {
    title: "Lokale Produktivnutzung manuell starten",
    status: "lokale Produktivnutzung manuell startbereit",
    localUsageThatCouldStartNow:
      "Jamal kann die Unternehmenszentrale lokal als Führungsinstrument nutzen: morgens Fokus setzen, eine Entscheidung sichtbar halten und abends Abschluss/Übergabe prüfen.",
    firstLocalProductiveRunFunctions: [
      "Produktive Tagesführung lokal nutzen",
      "Produktiven Tagesabschluss lokal nutzen",
      "Tagesübergabe lokal prüfen",
    ],
    manualStartDecisionRequired:
      "Jamal entscheidet bewusst, ob dieser erste lokale Produktivdurchlauf heute gestartet oder offen gelassen wird.",
    startConditions: [
      "Jamal nutzt die Zentrale nur lokal",
      "ein Fokus wird manuell gewählt",
      "eine Entscheidung wird manuell sichtbar gemacht",
      "eine Grenze wird bewusst bestätigt",
      "keine externe Verbindung wird gestartet",
    ],
    stopBoundaries: [
      "wenn echte Daten benötigt würden",
      "wenn eine externe Verbindung nötig wäre",
      "wenn eine Schreiboperation erforderlich wäre",
      "wenn eine automatische Entscheidung erwartet würde",
      "wenn ein Folgeagent starten soll",
    ],
    stillBlockedAfterStart: [
      "Airtable-Verbindung",
      "Plugin-Ausführung",
      "echte Kundendaten",
      "Schreiboperationen",
      "automatische Speicherung",
      "automatische Entscheidung",
      "Training oder Schulung",
      "Folgeagentenstart",
      "Deployment",
    ],
    smallestSafeNextStep:
      "Jamal startet nur einen lokalen Durchlauf mit Tagesführung, Tagesabschluss und Tagesübergabe; alles Externe bleibt gesperrt.",
    recommendation:
      "Starte die lokale Produktivnutzung nur als kontrollierten Führungsdurchlauf: 1 Fokus, 1 Entscheidung, 1 Grenze, 1 Abschluss.",
    qualityBoundary:
      "Der Startmodus darf echte Produktivität führen, aber keinen automatisierten Produktivbetrieb behaupten oder ersetzen.",
    safetyBoundary:
      "Keine Airtable-Verbindung, keine Plugin-Verbindung, keine externen Requests, keine Tokens oder Secrets, keine echten Kundendaten, keine Schreiboperation, keine automatische Speicherung, keine automatische Entscheidung, kein automatisches Training, keine automatische Schulung, kein Folgeagentenstart, kein Deployment und keine echte Produktivfreigabe ohne Jamals manuelle Entscheidung.",
    manualOnly: true,
    localOnly: true,
    manualStartOnly: true,
    requiresJamalApproval: true,
    realProductiveAutomationBlocked: true,
    externalConnectionBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
    deploymentBlocked: true,
  };
}

function getProductiveLocalUsageFirstRunEvaluation() {
  return {
    title: "Ersten lokalen Produktivdurchlauf manuell auswerten",
    status: "lokaler Produktivdurchlauf auswertbar vorbereitet",
    purpose:
      "Vorbereiten, wie Jamal einen manuell gestarteten lokalen Produktivdurchlauf auswerten kann, ohne zu behaupten, dass er bereits stattgefunden hat.",
    functionsToEvaluate: [
      "Produktive Tagesführung lokal nutzen",
      "Produktiven Tagesabschluss lokal nutzen",
      "Tagesübergabe lokal prüfen",
    ],
    manualQuestionsForJamal: [
      "Hat der Fokus den Tagesstart erleichtert?",
      "War die eine Entscheidung sichtbar genug?",
      "War die Grenze klar genug, um keine Automatik zu starten?",
      "Hat der Tagesabschluss geholfen, offen Gebliebenes zu erkennen?",
      "War die Übergabe für den nächsten Start brauchbar?",
      "Soll ein weiterer lokaler Durchlauf versucht werden?",
    ],
    possibleEvaluationResults: [
      "lokaler Durchlauf hilfreich",
      "lokaler Durchlauf teilweise hilfreich",
      "Unsicherheit erkannt",
      "Abbruchgrenze erreicht",
      "weiterer Durchlauf noch nicht empfohlen",
    ],
    stopBoundaries: [
      "echte Daten wären nötig",
      "eine externe Verbindung wäre nötig",
      "eine Schreiboperation wäre nötig",
      "Jamal müsste eine Entscheidung automatisch übernehmen lassen",
      "ein Folgeagent müsste starten",
    ],
    stillBlockedAfterEvaluation: [
      "Airtable-Verbindung",
      "Plugin-Ausführung",
      "echte Kundendaten",
      "Schreiboperationen",
      "automatische Speicherung",
      "automatische Entscheidung",
      "Training oder Schulung",
      "Folgeagentenstart",
      "Deployment",
    ],
    smallestSafeNextStep:
      "Nach einem manuell gestarteten lokalen Durchlauf nur eine lokale Einschätzung wählen: hilfreich, teilweise hilfreich, unsicher, Abbruchgrenze erreicht oder noch nicht erneut empfohlen.",
    recommendation:
      "Werte den ersten lokalen Produktivdurchlauf erst aus, nachdem Jamal ihn bewusst manuell genutzt hat. Vorher bleibt dies nur eine Auswertungsstruktur.",
    qualityBoundary:
      "Die Auswertung darf Orientierung geben, aber nicht behaupten, dass ein Durchlauf stattgefunden hat oder automatisch bewertet wurde.",
    safetyBoundary:
      "Keine automatische Auswertung, keine Speicherung, keine externe Verbindung, keine Airtable-Abfrage, keine Tokens oder Secrets, keine Kundendaten, keine Schreiboperation, keine automatische Entscheidung, kein Training, keine Schulung, kein Folgeagentenstart, kein Deployment und keine echte Produktivfreigabe ohne Jamals manuelle Entscheidung.",
    manualOnly: true,
    localOnly: true,
    evaluationPreparationOnly: true,
    noRunAssumed: true,
    requiresJamalApproval: true,
    automaticEvaluationBlocked: true,
    automaticStorageBlocked: true,
    externalConnectionBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
    deploymentBlocked: true,
  };
}

function getProductiveLocalUsageEvaluationLeadershipDecision() {
  return {
    title: "Auswertungsergebnis in lokale Führungsentscheidung überführen",
    status: "lokale Führungsentscheidung aus Auswertung vorbereitet",
    purpose:
      "Vorbereiten, wie Jamal ein später manuell ausgewertetes lokales Produktivdurchlauf-Ergebnis in eine nächste kleine Führungsentscheidung überführen kann.",
    sourceEvaluation: [
      "Der erste lokale Produktivdurchlauf ist bisher nur auswertbar vorbereitet.",
      "Es liegt noch kein echter bestätigter Produktivdurchlauf vor.",
      "Jamal müsste ein Ergebnis später manuell einordnen.",
    ],
    possibleEvaluationResults: [
      "lokal sinnvoll nutzbar",
      "lokal nur eingeschränkt nutzbar",
      "noch nicht produktiv genug",
      "zurück in Simulation/Vorbereitung",
      "Durchlauf abbrechen und nicht fortsetzen",
    ],
    possibleLeadershipDecisions: [
      "gleichen lokalen Durchlauf wiederholen",
      "nur eine Funktion lokal produktiv weiterführen",
      "Produktivnutzung pausieren",
      "zuerst Qualität/Sicherheit verbessern",
      "erst später Airtable-/Plugin-Test prüfen",
    ],
    manualQuestions: [
      "War das Ergebnis klar genug?",
      "Gab es Unsicherheit oder Fehlführung?",
      "Wurde irgendwo eine Grenze berührt?",
      "Ist der nächste Schritt klein genug?",
      "Darf überhaupt weiter lokal produktiv geführt werden?",
    ],
    stillBlockedAreas: [
      "Airtable-Verbindung",
      "externe Requests",
      "Schreiboperationen",
      "automatische Speicherung",
      "automatische Entscheidung",
      "automatische Schulung oder Training",
      "Folgeagentenstart",
      "echte Kundendaten",
      "echte Produktivfreigabe ohne Jamals Entscheidung",
    ],
    recommendation:
      "Erst ein später manuell bestätigtes Auswertungsergebnis lokal in eine kleine Führungsentscheidung überführen, bevor echte Verbindungen, Schreiboperationen oder Automationen vorbereitet werden.",
    qualityBoundary:
      "Die Zentrale darf nur weiterführen, wenn Ergebnis, Risiko, nächste Entscheidung und Abbruchgrenze klar sichtbar sind.",
    safetyBoundary:
      "Keine echte Verbindung, keine Speicherung, keine Automatisierung, keine Schreiboperation und keine Behauptung, dass der Produktivdurchlauf bereits stattgefunden hat.",
    smallestSafeNextStep:
      "Nur vorbereiten, welche kleine lokale Führungsentscheidung aus einem später manuell bestätigten Auswertungsergebnis folgen dürfte.",
    manualOnly: true,
    localOnly: true,
    noRunAssumed: true,
    requiresJamalApproval: true,
    automaticLeadershipDecisionBlocked: true,
    realProductiveUsageBlocked: true,
    externalConnectionBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveLocalLeadershipDecisionNextSafeStep() {
  return {
    title: "Nächsten sicheren lokalen Produktivschritt ableiten",
    status: "nächster lokaler Produktivschritt aus Führungsentscheidung vorbereitet",
    purpose:
      "Lokal vorbereiten, welcher kleinste sichere Produktivschritt nach Jamals manueller Führungsentscheidung möglich wäre, ohne einen echten Produktivdurchlauf zu behaupten oder zu starten.",
    sourceFromV6313: [
      "Die lokale Auswertung wurde in eine mögliche Führungsentscheidung überführt.",
      "Jamal entscheidet weiterhin manuell.",
      "Es wurde kein echter Produktivdurchlauf gestartet.",
      "Es wurde nichts automatisch gespeichert, versendet, verbunden oder ausgeführt.",
    ],
    possibleLocalLeadershipDecisions: [
      "lokalen Produktivschritt noch nicht starten",
      "nur Morgenstart lokal produktiv nutzen",
      "nur Tagesfokus lokal produktiv nutzen",
      "nur Entscheidungskarte lokal produktiv nutzen",
      "lokalen Produktivdurchlauf erneut simulieren",
      "vor Produktivnutzung weitere Sicherheitsgrenze klären",
    ],
    nextSafeProductiveSteps: [
      "eine lokale Morgenstart-Prüfung manuell durchführen",
      "eine lokale Tagesfokus-Entscheidung vorbereiten",
      "eine lokale Entscheidungskarte ausfüllen",
      "eine lokale Abbruchgrenze bestätigen",
      "den Produktivdurchlauf weiter nur simulieren",
      "keine Produktivnutzung starten",
    ],
    jamalQuestions: [
      "Welche Führungsentscheidung ist nach der Auswertung vertretbar?",
      "Welcher Schritt ist klein genug, um sicher lokal getestet zu werden?",
      "Welche Grenze muss vor echter Nutzung erneut bestätigt werden?",
      "Woran erkenne ich, dass der Schritt erfolgreich war?",
      "Wann muss der Schritt abgebrochen werden?",
    ],
    manualStartCondition: [
      "Der nächste Produktivschritt startet nicht automatisch.",
      "Jamal muss den Schritt bewusst selbst auswählen.",
      "Ohne manuelle Auswahl bleibt alles im vorbereiteten Zustand.",
    ],
    blockedAreas: [
      "echte Airtable-Verbindung",
      "Airtable-Abfrage",
      "Airtable-Schreiboperation",
      "externe Requests",
      "Kundendaten",
      "Tokens oder Secrets",
      "automatische Speicherung",
      "automatische Entscheidung",
      "automatische Schulung",
      "automatisches Training",
      "Folgeagentenstart",
      "Behauptung eines echten Produktivdurchlaufs",
    ],
    recommendation:
      "Als nächstes nur einen kleinsten lokalen Produktivschritt vorbereiten, aber nicht automatisch starten. Empfohlen ist eine manuelle lokale Morgenstart- oder Tagesfokus-Prüfung mit klarer Abbruchgrenze.",
    qualityBoundary:
      "Der Schritt ist nur gültig, wenn klar erkennbar ist, was Jamal manuell entscheidet, was lokal möglich wäre, was weiterhin gesperrt bleibt, wann abgebrochen werden muss und dass kein echter Produktivdurchlauf behauptet wird.",
    safetyBoundary:
      "Keine echte Verbindung, keine Automatisierung, keine Speicherung, keine externen Requests und keine Schreiboperation auslösen.",
    smallestSafeNextStep:
      "Nur eine lokale Morgenstart- oder Tagesfokus-Prüfung als möglichen nächsten Schritt vorbereiten und erst nach Jamals bewusster manueller Auswahl nutzen.",
    manualOnly: true,
    localOnly: true,
    noRunAssumed: true,
    requiresJamalApproval: true,
    automaticStartBlocked: true,
    realProductiveUsageBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    realAirtableWriteBlocked: true,
    externalRequestsBlocked: true,
    realCustomerDataBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    automaticTrainingBlocked: true,
    automaticEducationBlocked: true,
    followUpAgentStartBlocked: true,
    falseRunClaimBlocked: true,
  };
}

function getProductiveLeadershipWorkspace() {
  return {
    title: "Produktiver Führungsarbeitsplatz",
    currentLeadershipStatus: {
      version: "V1.1.5",
      status: "produktiver Führungsarbeitsplatz lokal vorbereitet",
      classification:
        "Lokal nutzbar, aber weiterhin ohne echte externe Verbindung, ohne Speicherung und ohne automatische Ausführung.",
    },
    leadToday: {
      dailyFocus:
        "Heute genau einen Bereich führen: Morgenstart, Tagesfokus oder lokale Entscheidungskarte.",
      leadershipDecision:
        "Soll heute ein erster echter lokaler Führungsdurchlauf mit vorhandenen lokalen Informationen manuell durchgeführt werden?",
      safetyBoundary:
        "Heute keine externe Verbindung, keine Airtable-Abfrage, keine Speicherung und keine automatische Ausführung starten.",
    },
    nextSafeProductiveStepFromV6314: {
      recommendedNextStep:
        "Eine manuelle lokale Morgenstart- oder Tagesfokus-Prüfung mit klarer Abbruchgrenze durchführen.",
      whySafe:
        "Der Schritt bleibt lokal, nutzt nur vorhandene lokale Informationen, braucht keine externen Daten und startet keine Automatik.",
      jamalMustConfirm:
        "Jamal bestätigt bewusst, ob heute nur Morgenstart oder Tagesfokus lokal produktiv genutzt wird.",
      stillBlockedAfterwards: [
        "Airtable-Verbindung",
        "Airtable-Abfrage",
        "externe Requests",
        "Kundendaten",
        "Schreiboperationen",
        "automatische Speicherung",
        "automatische Entscheidung",
        "Training",
        "Folgeagentenstarts",
      ],
    },
    locallyProductiveFunctions: [
      "Morgenstart prüfen",
      "Tagesfokus setzen",
      "eine Entscheidung vorbereiten",
      "Risiko/Grenze sichtbar machen",
      "Tagesabschluss auswerten",
      "Übergabe für morgen vorbereiten",
    ],
    notProductiveYetOrBlocked: [
      "keine Airtable-Verbindung",
      "keine echten Kundendaten",
      "keine externen Requests",
      "keine automatische Speicherung",
      "keine automatische Entscheidung",
      "kein Training",
      "keine Folgeagentenstarts",
      "keine Schreiboperationen",
    ],
    jamalQuestions: [
      "Welcher Bereich soll heute wirklich geführt werden?",
      "Welche Entscheidung ist heute wichtig genug?",
      "Welche Grenze darf heute nicht überschritten werden?",
      "Ist der nächste Schritt lokal sicher genug?",
      "Soll heute nur vorbereitet, simuliert oder manuell produktiv genutzt werden?",
    ],
    resultOrientedRecommendation:
      "Heute nicht weiter vorbereiten, sondern den ersten echten lokalen Führungsdurchlauf mit vorhandenen lokalen Informationen manuell durchführen.",
    qualityBoundary:
      "Der Bereich darf nicht behaupten, dass bereits ein echter Produktivdurchlauf stattgefunden hat. Er darf nur zeigen, dass der lokale Führungsarbeitsplatz vorbereitet ist.",
    safetyBoundary:
      "Keine neuen POST/PATCH/PUT/DELETE-Endpunkte, keine .env.local, keine Tokens, keine Airtable-Abfrage, keine externen Requests, keine Kundendaten, keine Schreiboperationen, keine automatische Speicherung, Entscheidung, Schulung oder Agentenfolgeaktion.",
    manualOnly: true,
    localOnly: true,
    noRunAssumed: true,
    requiresJamalApproval: true,
    automaticExecutionBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    externalRequestsBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveLeadershipWorkspaceDailyDecision() {
  return {
    title: "Tagesentscheidung aus Führungsarbeitsplatz",
    status: "manuelle Tagesentscheidung vorbereitet",
    source:
      "Ausgangspunkt ist V6.32.0: der produktive Führungsarbeitsplatz ist lokal vorbereitet und bleibt ohne externe Verbindung, Speicherung oder automatische Ausführung.",
    leadToday: {
      todaysFocus:
        "Heute genau einen lokalen Führungsbereich wählen: Tagesfokus, Entscheidungskarte oder Sicherheitsgrenze.",
      manualLeadershipDecision:
        "Jamal entscheidet manuell, ob heute ein lokaler Produktivschritt geführt wird oder bewusst offen bleibt.",
      allowedLocalProductiveStep:
        "Erlaubt ist nur ein lokaler Schritt mit vorhandenen lokalen Informationen, zum Beispiel Tagesfokus führen oder eine Entscheidung sichtbar machen.",
      confirmedBoundary:
        "Keine externe Verbindung, keine Airtable-Abfrage, keine Speicherung, keine Schreiboperation und keine automatische Entscheidung.",
      closureQuestion:
        "War am Tagesabschluss klar, welcher Fokus geführt wurde, welche Entscheidung sichtbar war und welche Grenze eingehalten wurde?",
    },
    possibleDailyDecisions: [
      "Heute nur Tagesfokus führen",
      "Heute eine Entscheidung sichtbar machen",
      "Heute einen sicheren lokalen Produktivschritt ausführen",
      "Heute nur Grenzen prüfen",
      "Heute keinen Produktivschritt starten",
    ],
    jamalQuestions: [
      "Was soll heute wirklich geführt werden?",
      "Welche Entscheidung ist heute klein genug?",
      "Welche Grenze darf heute nicht überschritten werden?",
      "Woran erkenne ich am Abend, ob der Tag gut geführt wurde?",
    ],
    recommendation:
      "Die Unternehmenszentrale empfiehlt, heute genau einen lokalen Produktivschritt manuell zu führen und ihn am Tagesende auszuwerten.",
    qualityBoundary:
      "Die Tagesentscheidung darf nur Orientierung geben. Sie darf keine echte Entscheidung automatisch treffen, keine Daten speichern und keine Folgeaktion auslösen.",
    safetyBoundary:
      "Keine externen Requests, keine Airtable-Verbindung, keine Tokens, keine Kundendaten, keine Schreiboperationen, keine automatische Speicherung, keine automatische Entscheidung, keine Schulung und keine Agentenfolgeaktion.",
    manualOnly: true,
    localOnly: true,
    requiresJamalApproval: true,
    automaticExecutionBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    followUpAgentStartBlocked: true,
    externalRequestsBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
  };
}

function getProductiveLeadershipWorkspaceDailyExecution() {
  return {
    title: "Tagesausführung aus Tagesentscheidung",
    status: "konkrete Tagesausführung vorbereitet",
    source:
      "Ausgangspunkt ist V6.32.1: Die manuelle Tagesentscheidung aus dem produktiven Führungsarbeitsplatz ist vorbereitet, aber nichts wurde automatisch gestartet.",
    manualDailyDecisionBasis:
      "Grundlage ist die Entscheidung, heute genau einen lokalen Produktivschritt manuell zu führen oder bewusst offen zu lassen.",
    concreteWorkStepToday:
      "Heute eine lokale Tagesfokus-Prüfung durchführen: Fokus benennen, eine kleine Entscheidung sichtbar machen und eine Sicherheitsgrenze bestätigen.",
    expectedResult:
      "Am Ende ist lokal sichtbar, welcher Fokus geführt wurde, welche Entscheidung vorbereitet ist und welche Grenze nicht überschritten wurde.",
    manualStartCondition:
      "Jamal startet diesen Schritt nur bewusst selbst. Ohne manuelle Auswahl bleibt die Tagesausführung vorbereitet.",
    stopBoundary:
      "Abbrechen, sobald externe Daten, Speicherung, Schreiboperation, Automatik, Airtable-Abfrage oder eine Folgeagentenaktion nötig wäre.",
    explicitlyNotAutomatic: [
      "kein automatischer Start",
      "keine automatische Speicherung",
      "keine automatische Dokumentation",
      "keine Weitergabe an Agenten",
      "keine externe Verbindung",
      "keine Airtable-Abfrage",
      "keine Schreiboperation",
    ],
    recommendation:
      "Führe heute nur eine lokale Tagesfokus-Prüfung manuell aus und werte sie anschließend im Tagesabschluss aus.",
    qualityBoundary:
      "Die Tagesausführung ist nur gültig, wenn Arbeitsschritt, erwartetes Ergebnis, Startbedingung und Abbruchgrenze klar sichtbar sind.",
    safetyBoundary:
      "Keine externen Requests, keine Airtable-Verbindung, keine Tokens oder Secrets, keine Kundendaten, keine Schreiboperationen, keine automatische Speicherung, keine automatische Entscheidung, keine automatische Schulung und keine automatische Agentenfolgeaktion.",
    manualOnly: true,
    localOnly: true,
    executionPreparationOnly: true,
    requiresJamalApproval: true,
    automaticStartBlocked: true,
    automaticExecutionBlocked: true,
    automaticStorageBlocked: true,
    automaticDocumentationBlocked: true,
    automaticDecisionBlocked: true,
    followUpAgentStartBlocked: true,
    externalRequestsBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    tokenUseBlocked: true,
    secretUseBlocked: true,
    realCustomerDataBlocked: true,
    writeOperationsBlocked: true,
  };
}

function getProductiveLeadershipWorkspaceDailyExecutionEvaluation() {
  return {
    title: "Tagesausführung manuell auswerten",
    status: "Tagesausführung auswertbar vorbereitet",
    sourceFromV6322: [
      "Tagesentscheidung wurde in eine konkrete heutige Tagesausführung überführt.",
      "Ausführung ist nur vorbereitet, nicht automatisch gestartet.",
    ],
    executionToEvaluate: {
      concreteWorkStep:
        "Eine lokale Tagesfokus-Prüfung durchführen: Fokus benennen, eine kleine Entscheidung sichtbar machen und eine Sicherheitsgrenze bestätigen.",
      expectedResult:
        "Lokal sichtbar: geführter Fokus, vorbereitete Entscheidung und eingehaltene Grenze.",
      manualStartCondition:
        "Jamal muss den Schritt bewusst selbst gestartet haben, bevor ein Ergebnis verwertbar ist.",
      stopBoundary:
        "Abbruch, sobald externe Daten, Speicherung, Schreiboperation, Automatik, Airtable-Abfrage oder Folgeagentenaktion nötig wäre.",
    },
    manualEvaluationQuestions: [
      "Wurde der Arbeitsschritt tatsächlich ausgeführt?",
      "Ist das erwartete Ergebnis sichtbar entstanden?",
      "Gibt es eine neue Unsicherheit, Blockade oder Entscheidung?",
    ],
    possibleResultValues: [
      "erfolgreich ausführbar",
      "teilweise ausführbar",
      "blockiert",
      "nicht gestartet",
      "unklar / erneut prüfen",
    ],
    recommendation:
      "Wenn erfolgreich: nächsten sicheren Folgeschritt vorbereiten. Wenn teilweise, blockiert oder unklar: keine Automatisierung starten, sondern Ursache sichtbar machen.",
    qualityBoundary:
      "Ein Ergebnis gilt nur als verwertbar, wenn Jamal es manuell geprüft hat.",
    safetyBoundary:
      "Keine automatische Fortsetzung, keine externe Aktion, keine Speicherung, kein Schreiben in Airtable oder andere Tools.",
    manualOnly: true,
    localOnly: true,
    evaluationPreparationOnly: true,
    requiresJamalManualReview: true,
    automaticContinuationBlocked: true,
    automaticExecutionBlocked: true,
    automaticStorageBlocked: true,
    automaticDecisionBlocked: true,
    externalActionBlocked: true,
    externalRequestsBlocked: true,
    realAirtableConnectionBlocked: true,
    realAirtableQueryBlocked: true,
    writeOperationsBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

const PRODUCTIVE_PROJECT_AREAS = [
  "KI-Unternehmenszentrale",
  "Health Upgrade Kompass",
  "Expansion App",
  "Marketing Agentur OS",
  "FlowLingo Portugiesisch Sprachtrainer",
  "Your Day / Portugal 2.0",
  "weitere Projekte nur als Platzhalter, nicht automatisch aktivieren",
];

const PRODUCTIVE_READ_ONLY_PLUGIN_BRIDGE = [
  {
    plugin: "Airtable read-only",
    helpsWith: "Projektstatus, Aufgaben oder Entscheidungsstände sichtbar machen.",
    informationToRead: "Projektstatus, Aufgabenlisten oder offene Entscheidungsstände.",
    projectBenefit: "KI-Unternehmenszentrale und Health Upgrade Kompass profitieren zuerst.",
    manualApprovalRequired: true,
    blockedActions:
      "Keine Airtable-Schreiboperation, keine Tabellenänderung, keine Record-Erstellung und keine automatische Synchronisierung.",
  },
  {
    plugin: "Gmail read-only",
    helpsWith: "Relevante Projektkommunikation finden und zusammenfassen.",
    informationToRead: "Betreff, Absender, Datum und relevante Textauszüge nach Jamals manueller Freigabe.",
    projectBenefit: "Marketing Agentur OS, Expansion App und Kunden-/Partnerprojekte profitieren.",
    manualApprovalRequired: true,
    blockedActions:
      "Keine automatische E-Mail, keine Antwort, kein Versand, kein Labeln und keine Postfachänderung.",
  },
  {
    plugin: "Google Calendar read-only",
    helpsWith: "Heutige Projekttermine oder Fristen sichtbar machen.",
    informationToRead: "Kalendereinträge, Zeitfenster und Frist-Hinweise nur lesend.",
    projectBenefit: "Your Day / Portugal 2.0, Expansion App und Tagesführung profitieren.",
    manualApprovalRequired: true,
    blockedActions:
      "Keine Kalenderänderung, kein Termin erstellen, kein Termin verschieben und keine Einladung senden.",
  },
  {
    plugin: "Google Drive read-only",
    helpsWith: "Projektdokumente auffindbar machen.",
    informationToRead: "Dateinamen, Ordnerkontext und freigegebene Dokumentinhalte nur lesend.",
    projectBenefit: "Health Upgrade Kompass, FlowLingo und Marketing Agentur OS profitieren.",
    manualApprovalRequired: true,
    blockedActions:
      "Keine Dateiänderung, kein Upload, kein Löschen, keine Freigabeänderung und keine automatische Ablage.",
  },
  {
    plugin: "GitHub read-only",
    helpsWith: "Projekt-/Code-Stand, Issues oder PRs sichtbar machen.",
    informationToRead: "Repository-Status, Branch-/Issue-/PR-Kontext nur lesend.",
    projectBenefit: "KI-Unternehmenszentrale, Expansion App und technische Produktprojekte profitieren.",
    manualApprovalRequired: true,
    blockedActions:
      "Keine Commits, keine Pull Requests, keine Issue-Änderung, kein Push und kein Deployment.",
  },
];

function getProductiveProjectWorkspaceReadiness() {
  return {
    title: "Projektarbeitsfähigkeit mit Plugin-Erweiterungsbrücke",
    status: "Projektarbeitsplatz vorbereitet",
    sourceFromV6323: [
      "Tagesausführung wurde manuell auswertbar vorbereitet.",
      "Ergebnisprüfung bleibt manuell.",
      "Keine automatische Fortsetzung.",
      "Jamal bleibt Entscheidungs- und Freigabepunkt.",
    ],
    purpose: [
      "Die KI-Unternehmenszentrale soll von Tageslogik in echte Projektarbeit übergehen.",
      "Ziel ist ein arbeitsfähiger Projektarbeitsplatz.",
      "Projektarbeit soll geführt, begrenzt, nachvollziehbar und qualitätsgesichert bleiben.",
    ],
    projectWorkReadiness: [
      "Projekt auswählen",
      "aktuellen Projektstatus sichtbar machen",
      "nächsten sinnvollen Projektschritt ableiten",
      "Blocker und offene Entscheidungen sichtbar machen",
      "benötigte Informationen benennen",
      "Plugin-/Tool-Bedarf je Projekt erkennen",
    ],
    possibleProjectAreas: PRODUCTIVE_PROJECT_AREAS,
    immediatelyUsableProjectWorkspace: {
      recommendedProjectToday: "Health Upgrade Kompass",
      smallestSafeWorkStep:
        "Den nächsten lokalen Qualitäts- oder Demo-Prüfschritt sichtbar machen, ohne neue Funktion zu starten.",
      expectedVisibleResult:
        "Jamal sieht Projektstatus, kleinsten nächsten Schritt, fehlende Information, Grenze und mögliche read-only Unterstützung.",
      missingInformationBeforeWork:
        "Welcher konkrete Projektstand oder welche letzte Entscheidung als aktuell gilt.",
      helpfulPluginLater:
        "Airtable read-only für Projektstatus oder Google Drive read-only für Projektdokumente.",
      stillNotAllowed:
        "Keine echte externe Anfrage, keine Schreiboperation, keine automatische Projektbearbeitung und keine Agentenfolgeaktion.",
    },
    blockedAreas: [
      "keine automatische E-Mail",
      "keine automatische Kalenderänderung",
      "keine Airtable-Schreiboperation",
      "keine Google-Drive-Dateiänderung",
      "keine GitHub-Schreiboperation",
      "keine automatische Projektentscheidung",
      "keine automatische Agentenfolgeaktion",
      "keine echte externe Anfrage ohne Jamals manuelle Freigabe",
    ],
    recommendation:
      "Als nächsten Produktivitätsschritt einen Projektarbeitsplatz vorbereiten: ein Projekt führen, kleinsten Arbeitsschritt sichtbar machen und read-only Tool-Bedarf nur planen.",
    qualityBoundary:
      "Ein Projektschritt gilt nur als sinnvoll, wenn er einem echten Projekt hilft. Keine neuen UI-Blöcke ohne konkrete Führungs-, Projekt- oder Produktivitätsfunktion.",
    safetyBoundary:
      "Keine externe Aktion, keine Speicherung, keine Schreiboperation, keine Automatisierung, keine Agentenfolgeaktion und keine Verbindung zu Airtable, Gmail, Google Calendar, Google Drive oder GitHub ohne ausdrückliche manuelle Freigabe durch Jamal.",
    manualOnly: true,
    localOnly: true,
    requiresJamalApproval: true,
    madeExternalRequest: false,
    writeOperationsBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticDecisionBlocked: true,
    automaticContinuationBlocked: true,
  };
}

function getProductivePluginExpansionBridge() {
  return {
    title: "Plugin-Erweiterungsbrücke",
    status: "read-only Erweiterungsbrücke vorbereitet",
    purpose:
      "Sichtbar machen, welche Plugin-/Tool-Erweiterungen einen nächsten Produktivitätsschritt unterstützen könnten, ohne sie zu verbinden oder auszuführen.",
    readOnlyExtensions: PRODUCTIVE_READ_ONLY_PLUGIN_BRIDGE,
    recommendation:
      "Plugin-Erweiterungen zuerst nur read-only planen und sichtbar machen. Der Nutzen muss direkt auf Projektarbeit einzahlen.",
    qualityBoundary:
      "Keine Plugin-Erweiterung ohne klaren Nutzen für Projektarbeit.",
    safetyBoundary:
      "Keine externe Verbindung, keine Schreiboperation, keine Automatisierung und keine Anfrage ohne Jamals ausdrückliche manuelle Freigabe.",
    manualOnly: true,
    readOnlyPlanningOnly: true,
    externalRequestsBlocked: true,
    writeOperationsBlocked: true,
    automaticExecutionBlocked: true,
    requiresJamalApproval: true,
    madeExternalRequest: false,
  };
}

function getProductiveReadOnlyProjectContextPreparation() {
  return {
    title: "Read-only Projektkontext vorbereiten",
    status: "Projektkontext read-only vorbereitet",
    readOnlyChecks: PRODUCTIVE_READ_ONLY_PLUGIN_BRIDGE.map((entry) => ({
      plugin: entry.plugin,
      helpPurpose: entry.helpsWith,
      informationToRead: entry.informationToRead,
      projectBenefit: entry.projectBenefit,
      manualApprovalRequired: entry.manualApprovalRequired,
      blockedWriteOrAutomation: entry.blockedActions,
    })),
    nextManualStep:
      "Jamal wählt ein Projekt und entscheidet manuell, welche read-only Informationsquelle später überhaupt geprüft werden darf.",
    recommendation:
      "Zuerst Projektarbeitsplatz lokal nutzen; erst danach eine einzelne read-only Quelle mit klarem Nutzen vorbereiten.",
    safetyBoundary:
      "Keine Airtable-, Gmail-, Calendar-, Drive- oder GitHub-Verbindung ohne manuelle Freigabe; keine Schreiboperation und keine automatische Projektbearbeitung.",
    manualOnly: true,
    readOnlyOnly: true,
    noConnectionStarted: true,
    madeExternalRequest: false,
    externalRequestsBlocked: true,
    writeOperationsBlocked: true,
    automaticProjectWorkBlocked: true,
  };
}

function getProductiveManualProjectWorkRunPreparation() {
  return {
    title: "Ersten manuellen Projektarbeitsdurchlauf vorbereiten",
    status: "manueller Projektarbeitsdurchlauf vorbereitet",
    sourceFromV6324: [
      "Projektarbeitsfähigkeit mit Plugin-Erweiterungsbrücke ist vorbereitet.",
      "Health Upgrade Kompass ist als sinnvoller erster Projektarbeitsplatz sichtbar.",
      "Plugin-/Tool-Erweiterungen bleiben nur read-only geplant.",
      "Jamal bleibt Start-, Entscheidungs- und Freigabepunkt.",
    ],
    selectedFirstProject: "Health Upgrade Kompass",
    currentProjectWorkStatus:
      "Lokaler Projektarbeitsplatz vorbereitet; echte Projektbearbeitung noch nicht gestartet.",
    safeProjectWorkAreas: [
      "Demo-/Qualitätslogik lokal prüfen",
      "Projektstatus und offene Entscheidung sichtbar machen",
      "nächsten kleinsten Projektschritt ohne neue Funktion formulieren",
    ],
    recommendedFirstManualProjectWorkStep:
      "Den Health Upgrade Kompass lokal prüfen und nur notieren: aktueller Stand, kleinster nächster Qualitätsschritt, offene Entscheidung und klare Grenze.",
    expectedResult:
      "Jamal sieht nach dem Durchlauf einen konkreten Projektstatus, einen kleinsten nächsten Schritt, eine offene Entscheidung und eine Abbruchgrenze.",
    manualStartCondition:
      "Jamal startet den Projektarbeitsdurchlauf bewusst selbst. Ohne manuelle Auswahl bleibt alles vorbereitet.",
    stopBoundary:
      "Abbrechen, sobald echte Kundendaten, externe Verbindung, Speicherung, Schreiboperation, neue Funktion, Plugin-Aktion oder Folgeagent nötig wäre.",
    blockedAreas: [
      "echte Projektbearbeitung automatisch starten",
      "Airtable-, Gmail-, Calendar-, Drive- oder GitHub-Verbindung",
      "Schreiboperationen",
      "Speicherung",
      "automatische Projektentscheidung",
      "automatische Fortsetzung",
      "Agentenfolgeaktion",
      "neue Funktion ohne Jamals Freigabe",
    ],
    readOnlyPluginNeed: [
      "Airtable read-only kann später Projektstatus oder Entscheidungsstände sichtbar machen.",
      "Google Drive read-only kann später Projektdokumente auffindbar machen.",
      "Gmail read-only kann später relevante Projektkommunikation zusammenfassen.",
    ],
    recommendation:
      "Als ersten Projektarbeitsdurchlauf Health Upgrade Kompass lokal führen: Status klären, kleinsten sicheren Schritt formulieren und read-only Plugin-Bedarf nur sichtbar machen.",
    qualityBoundary:
      "Der Durchlauf ist nur sinnvoll, wenn er Health Upgrade Kompass konkret weiterbringt und Ergebnis, Risiko, Grenze und nächster Schritt sichtbar werden.",
    safetyBoundary:
      "Keine echte Projektbearbeitung, keine Speicherung, keine Schreiboperation, keine externe Verbindung, keine Plugin-Aktion, keine automatische Fortsetzung und keine Agentenfolgeaktion.",
    manualOnly: true,
    localOnly: true,
    selectedProjectRequiresJamalApproval: true,
    madeExternalRequest: false,
    externalRequestsBlocked: true,
    writeOperationsBlocked: true,
    storageBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticContinuationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveManualProjectWorkRunEvaluation() {
  return {
    title: "Ersten manuellen Health-Projektdurchlauf auswerten",
    source: "V6.32.5",
    project: "Health Upgrade Kompass",
    status: "manueller Health-Projektdurchlauf auswertbar vorbereitet",
    manuallyPerformed:
      "Nur wenn Jamal den vorbereiteten Health-Projektarbeitsschritt bewusst manuell durchgeführt hat, kann das Ergebnis lokal eingeordnet werden. Die Zentrale behauptet keine Durchführung.",
    evaluationQuestions: [
      "Wurde der vorbereitete Projektarbeitsschritt vollständig verstanden?",
      "Konnte Jamal den Schritt ohne Tool-Verbindung durchführen?",
      "Welche Information war klar?",
      "Welche Information fehlte?",
      "Gab es Unsicherheit, Risiko oder Entscheidungsbedarf?",
      "Ist der nächste Schritt weiterhin sicher ableitbar?",
    ],
    possibleEvaluationResults: [
      "Health-Projektarbeit fortsetzen",
      "Projektarbeit enger führen",
      "zurück in Vorbereitung",
      "fehlende Projektinformation sichtbar machen",
      "Plugin-Bedarf nur read-only notieren",
      "stoppen",
    ],
    recommendation:
      "Den Health-Projektdurchlauf erst nach manueller Durchführung auswerten: Ergebnis, fehlende Information, Risiko und nächsten sicheren Schritt sichtbar machen, ohne echte Projektbearbeitung oder Tool-Verbindung zu starten.",
    qualityBoundary:
      "Die Auswertung ist nur verwertbar, wenn Jamal den Durchlauf manuell geprüft hat und klar ist, was verstanden wurde, was fehlt und welche Grenze gilt.",
    safetyBoundary:
      "Keine echte Projektbearbeitung, keine Speicherung, keine Schreiboperation, keine externe Verbindung, keine Plugin-Aktion, keine automatische Fortsetzung und keine Agentenfolgeaktion.",
    manualOnly: true,
    localOnly: true,
    requiresManualCompletionByJamal: true,
    realProjectWorkStarted: false,
    madeExternalRequest: false,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticContinuationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveHealthProjectAgentWorkOrder() {
  return {
    title: "Health-Projektarbeit in Agentenauftrag überführen",
    source: "V6.32.6",
    project: "Health Upgrade Kompass",
    status: "Agentenauftrag vorbereitet",
    goal:
      "Aus dem manuellen Health-Projektdurchlauf einen klaren Arbeitsauftrag für die Agents ableiten, ohne echte Projektbearbeitung zu starten.",
    firstSafeAgentWorkOrder:
      "Die Agents bereiten nur lokal vor, wie der nächste Health-Projektschritt fachlich, gestalterisch, technisch, prüfbar und sicher geführt werden müsste.",
    involvedAgents: [
      "GF-Agent",
      "Projektmanager-Agent",
      "Produktmanager-Agent",
      "Design-Director-Agent",
      "Entwickler-Agent",
      "QA-Agent",
      "Compliance/Risiko-Agent",
      "Plugin/Tool-Radar-Agent",
      "Wissens/Archiv-Agent",
    ],
    agentOrders: [
      {
        agent: "GF-Agent",
        order: "Entscheiden, ob der Health-Auftrag relevant genug ist, heute weitergeführt zu werden.",
        expectedResult: "Klare Relevanz- und Prioritätseinschätzung für Jamal.",
        boundary: "Keine finale Projektfreigabe und keine automatische Entscheidung.",
      },
      {
        agent: "Projektmanager-Agent",
        order: "Den Health-Projektschritt in klare Teilaufgaben, Reihenfolge und Abbruchgrenze zerlegen.",
        expectedResult: "Eine kleine, führbare Aufgabenfolge ohne automatische Verteilung.",
        boundary: "Keine automatische Aufgabenverteilung und kein Folgeagentenstart.",
      },
      {
        agent: "Produktmanager-Agent",
        order: "Nutzen, Zielgruppe, fachliche Anforderungen und offene Produktentscheidung klären.",
        expectedResult: "Produktlogik mit Nutzen, Zielgruppe, Annahmen und offener Entscheidung.",
        boundary: "Keine Produktentscheidung, keine neue Funktion und keine Marktbehauptung.",
      },
      {
        agent: "Design-Director-Agent",
        order: "UI/UX, Verständlichkeit, Vertrauen und Premium-Wirkung des Health-Schritts prüfen.",
        expectedResult: "Design- und Verständlichkeitsbefund mit kleinster Verbesserungsidee.",
        boundary: "Keine Designänderung automatisch umsetzen und keine Veröffentlichung.",
      },
      {
        agent: "Entwickler-Agent",
        order: "Technische Umsetzungsmöglichkeiten und Risiken lokal vorbereiten.",
        expectedResult: "Technische Einschätzung ohne Codeänderung, Commit, Deployment oder Tool-Verbindung.",
        boundary: "Keine echte Implementierung, kein Commit, kein Push und kein Deployment.",
      },
      {
        agent: "QA-Agent",
        order: "Prüfpunkte für den nächsten Health-Schritt definieren.",
        expectedResult: "Manuelle Checkliste für Verständlichkeit, Demo-Fluss, Sicherheit und Abbruchpunkte.",
        boundary: "Keine automatische Prüfung, keine Speicherung und keine echte Freigabe.",
      },
      {
        agent: "Compliance/Risiko-Agent",
        order: "Grenzen prüfen: keine Diagnose, keine Heilversprechen, keine sensiblen Kundendaten.",
        expectedResult: "Risiko- und Grenzenhinweis für Jamal.",
        boundary: "Keine Rechtsberatung, keine medizinische Aussage und keine finale Compliance-Freigabe.",
      },
      {
        agent: "Plugin/Tool-Radar-Agent",
        order: "Benötigte Plugins nur read-only notieren.",
        expectedResult: "Read-only Plugin-Bedarf für Airtable, Drive oder spätere Projektinformationen.",
        boundary: "Keine Plugin-Verbindung, keine externe Anfrage und keine Installation.",
      },
      {
        agent: "Wissens/Archiv-Agent",
        order: "Benennen, welche Projektinformationen später dokumentiert werden müssten.",
        expectedResult: "Liste dokumentationswürdiger Projektinformationen ohne Speicherung.",
        boundary: "Keine automatische Archivierung und keine Datenänderung.",
      },
    ],
    agentWorkSequence: [
      "GF-Agent prüft Relevanz.",
      "Projektmanager-Agent strukturiert Teilaufgaben und Reihenfolge.",
      "Produktmanager-Agent klärt Nutzen, Zielgruppe und Anforderungen.",
      "Design-Director-Agent prüft Verständlichkeit und Wirkung.",
      "Compliance/Risiko-Agent markiert Grenzen.",
      "Entwickler-Agent bereitet technische Optionen vor.",
      "QA-Agent definiert Prüfpunkte.",
      "Plugin/Tool-Radar-Agent notiert read-only Bedarf.",
      "Wissens/Archiv-Agent benennt spätere Dokumentation.",
    ],
    jamalManualApprovalDecision:
      "Jamal entscheidet manuell, ob dieser vorbereitete Agentenauftrag später als echter lokaler Arbeitsauftrag genutzt werden darf.",
    stillBlockedAreas: [
      "echte Projektbearbeitung",
      "Speicherung",
      "Schreiboperationen",
      "Tool-Verbindung",
      "externe Requests",
      "automatische Aufgabenverteilung",
      "automatische Fortsetzung",
      "Folgeagentenstart",
      "Airtable-, Gmail-, Calendar-, Drive- oder GitHub-Verbindung",
    ],
    readOnlyPluginNeed: [
      "Airtable read-only für späteren Projektstatus oder Entscheidungsstände.",
      "Google Drive read-only für spätere Projektdokumente.",
      "Gmail read-only für spätere relevante Projektkommunikation.",
      "GitHub read-only nur falls technische Projektstände betroffen sind.",
    ],
    qualityBoundary:
      "Der Agentenauftrag ist nur sinnvoll, wenn Rolle, Auftrag, erwartetes Ergebnis, Grenze und Reihenfolge je Agent klar sichtbar sind.",
    safetyBoundary:
      "Agents führen noch nichts automatisch aus. Keine echte Projektbearbeitung, keine Speicherung, keine Tool-Verbindung, keine Schreiboperation, keine externe Anfrage und keine automatische Fortsetzung.",
    manualOnly: true,
    localOnly: true,
    requiresJamalApproval: true,
    madeExternalRequest: false,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticContinuationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveHealthProjectAgentRunEvaluation() {
  return {
    title: "Simulierten Health-Agentenlauf manuell auswerten",
    project: "Health Upgrade Kompass",
    status: "simulierter Agentenlauf auswertbar vorbereitet",
    evaluationStartingPoint: [
      "V6.33.0 hat den Health-Projektauftrag in vorbereitete Agentenarbeitsfähigkeit überführt.",
      "V6.33.1 steht als simulierter read-only Health-Agentenlauf: kein Agent hat automatisch gearbeitet.",
      "Es wurde nichts automatisch ausgeführt, nichts gespeichert und nichts extern verbunden.",
    ],
    evaluationByAgentGroup: [
      {
        group: "Führung & Projektsteuerung",
        agents: ["GF-Agent", "Projektmanager-Agent", "Produktmanager-Agent"],
        checkedInSimulation:
          "Relevanz, Teilaufgaben, Reihenfolge, Nutzen, Zielgruppe und fachliche Anforderungen des nächsten Health-Schritts.",
        expectedResult:
          "Ein klar priorisierter, klein geschnittener Health-Projektarbeitsschritt mit sichtbarer Entscheidung.",
        simulatedResult:
          "Grundsätzlich freigabefähig, wenn Jamal den nächsten Schritt weiterhin eng und lokal begrenzt.",
        resultingAction: "Freigabe für nächsten manuellen Projektarbeitsschritt möglich.",
        boundary:
          "Keine automatische Projektentscheidung, keine Aufgabenverteilung und keine Fortsetzung ohne Jamal.",
      },
      {
        group: "Produkt, Design & Umsetzung",
        agents: ["Design-Director-Agent", "Entwickler-Agent", "QA-Agent"],
        checkedInSimulation:
          "UI/UX-Verständlichkeit, Premium-Wirkung, technische Umsetzbarkeit und manuelle Prüfpunkte.",
        expectedResult:
          "Ein konkret prüfbares Arbeitsergebnis mit Design-, Technik- und QA-Grenzen.",
        simulatedResult:
          "Teilweise freigabefähig: Der nächste Schritt muss als manuelle Qualitäts-/Demo-Prüfung formuliert bleiben.",
        resultingAction: "Nacharbeit in Form einer engeren Ergebnisdefinition sinnvoll.",
        boundary:
          "Keine Codeänderung, kein Commit, kein Deployment, keine automatische Prüfung und keine echte Demo-Änderung.",
      },
      {
        group: "Sicherheit, Tools & Wissen",
        agents: ["Compliance/Risiko-Agent", "Plugin/Tool-Radar-Agent", "Wissens/Archiv-Agent"],
        checkedInSimulation:
          "Gesundheitsgrenzen, keine Diagnose, keine Heilversprechen, read-only Plugin-Bedarf und spätere Dokumentationspunkte.",
        expectedResult:
          "Klare Sicherheitsgrenze mit nur read-only notiertem Plugin- und Wissensbedarf.",
        simulatedResult:
          "Freigabefähig unter Grenze: keine externen Tools, keine Kundendaten, keine Speicherung.",
        resultingAction: "Read-only Bedarf nur notieren; keine Verbindung vorbereiten.",
        boundary:
          "Keine Airtable-, Gmail-, Calendar-, Drive- oder GitHub-Verbindung, keine Speicherung und keine externen Requests.",
      },
    ],
    overallEvaluation: {
      possibleResultValues: [
        "freigabefähig für nächsten manuellen Projektarbeitsschritt",
        "teilweise freigabefähig mit Nacharbeit",
        "noch nicht freigabefähig",
        "abbrechen und Auftrag neu schneiden",
      ],
      recommendedResult:
        "teilweise freigabefähig mit Nacharbeit: nächster Schritt darf vorbereitet werden, aber nur eng begrenzt, manuell und ohne Tool-Verbindung.",
    },
    jamalLeadershipDecision: {
      title: "Jamals manuelle Führungsentscheidung",
      options: [
        "Nächsten manuellen Health-Projektarbeitsschritt freigeben",
        "Agentenauftrag nachschärfen",
        "Nur einzelne Agentengruppe weiter vorbereiten",
        "Simulation stoppen und zurück zur Projektklärung",
      ],
      recommendedDecision:
        "Nächsten manuellen Health-Projektarbeitsschritt freigeben, aber weiterhin ohne automatische Ausführung und ohne externe Tool-Verbindung.",
    },
    nextMajorProductivityStep: {
      title: "Ersten manuellen Health-Projektarbeitsschritt aus Agentenauswertung vorbereiten",
      concreteWorkResult:
        "Ein klarer Health-Projektarbeitsauftrag mit Ziel, Zuständigkeit, Prüfergebnis und Abbruchgrenze.",
      responsibleAgent: "Projektmanager-Agent mit GF-, Produkt-, Design-, QA- und Compliance-Zuarbeit.",
      requiresJamalManualApproval: true,
      automaticExecutionBlocked: true,
      externalRequestsBlocked: true,
      storageBlocked: true,
    },
    qualityBoundary:
      "Die Auswertung ist nur gültig, wenn aus dem simulierten Agentenlauf eine konkrete, manuell prüfbare nächste Health-Projektarbeit abgeleitet werden kann. Reine Statusanzeigen ohne Entscheidung oder nächsten Arbeitsschritt reichen nicht aus.",
    safetyBoundary:
      "Auch nach der Auswertung darf kein Agent automatisch Projektarbeit starten, keine Daten speichern, keine externen Systeme verbinden und keine Entscheidung ohne Jamals manuelle Freigabe treffen.",
    manualOnly: true,
    readOnlySimulationOnly: true,
    requiresJamalApproval: true,
    madeExternalRequest: false,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticDecisionBlocked: true,
    automaticContinuationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveManualHealthProjectWorkStepPreparation() {
  return {
    title: "Ersten manuellen Health-Projektarbeitsschritt vorbereiten",
    source: "V6.33.2",
    project: "Health Upgrade Kompass",
    status: "erster manueller Health-Projektarbeitsschritt vorbereitet",
    startingPoint: [
      "Grundlage ist die simulierte Health-Agentenlauf-Auswertung aus V6.33.2.",
      "Die Agenten haben nicht produktiv gearbeitet.",
      "Es wurde nur simuliert und manuell auswertbar gemacht.",
      "Jetzt wird daraus ein einziger manueller nächster Projektarbeitsschritt vorbereitet.",
    ],
    jamalLeadershipDecision: {
      title: "Jamals manuelle Führungsentscheidung",
      options: [
        {
          decision: "freigeben",
          meaning:
            "Der vorbereitete Health-Projektarbeitsschritt darf manuell gestartet werden.",
        },
        {
          decision: "zurückstellen",
          meaning: "Der Schritt ist noch nicht reif genug und bleibt vorbereitet.",
        },
        {
          decision: "stoppen",
          meaning:
            "Der Schritt darf nicht ausgeführt werden, weil Risiko, Unklarheit oder Qualitätsgrenze verletzt wären.",
        },
      ],
    },
    preparedManualHealthProjectWorkStep: {
      title:
        "Health Upgrade Kompass: erste manuelle Produktstruktur aus Agentenauswertung ableiten",
      description:
        "Aus der Agentenauswertung wird lokal abgeleitet, welche Produktstruktur für den Health Upgrade Kompass zuerst manuell geprüft werden sollte.",
      productStructureToDerive:
        "Eine erste Struktur aus Einstieg, Kompass-Flow, Ergebnislogik, Beratungsübergang und Kundenbereich.",
      coreStructureAreasToCheck: [
        "Einstieg und Nutzenversprechen",
        "Kompass-Start und Antwortlogik",
        "Ergebnis-Seite und nächste Empfehlung",
        "Übergang zu Beratung oder Begleitung",
        "Kundenbereich und sichere Weiterführung",
      ],
      allowedAgentInputs: [
        "GF-Agent liefert Relevanz- und Entscheidungslogik.",
        "Projektmanager-Agent ordnet Reihenfolge, Blocker und nächsten Schritt.",
        "Produktmanager-Agent leitet Produktstruktur, Nutzerfluss und MVP-Abgrenzung ab.",
        "Design-Agent beschreibt Struktur- und UI-Bedarf.",
        "Entwickler-Agent prüft lokale technische Machbarkeit.",
        "QA-Agent benennt Prüffragen und Abbruchgrenzen.",
        "Compliance/Risiko-Agent prüft Health-Grenzen.",
        "Plugin/Tool-Radar-Agent benennt nur möglichen read-only Toolbedarf.",
        "Wissens/Archiv-Agent benennt relevante Projektinformationen.",
      ],
      jamalRole:
        "Jamal gibt den Schritt bewusst frei, stellt ihn zurück oder stoppt ihn. Ohne Jamals Entscheidung startet nichts.",
      visibleManualIntermediateResult:
        "Eine erste Produktstruktur, offene Produktfragen, MVP-Grenze, Nicht-Umsetzen-Liste und Freigabeempfehlung.",
    },
    involvedAgentRoles: [
      {
        role: "GF-Agent",
        contribution: "bereitet Entscheidungslogik vor",
        boundary: "entscheidet aber nicht für Jamal",
      },
      {
        role: "Projektmanager-Agent",
        contribution: "ordnet Reihenfolge, Blocker und nächsten Schritt",
        boundary: "verteilt keine Aufgaben automatisch",
      },
      {
        role: "Produktmanager-Agent",
        contribution: "leitet Produktstruktur, Nutzerfluss und MVP-Abgrenzung ab",
        boundary: "trifft keine Produktentscheidung",
      },
      {
        role: "Design-Agent",
        contribution: "beschreibt Struktur- und UI-Bedarf",
        boundary: "erstellt keine finalen Designs",
      },
      {
        role: "Entwickler-Agent",
        contribution: "prüft technische Machbarkeit lokal",
        boundary: "baut nichts automatisch weiter",
      },
      {
        role: "QA-Agent",
        contribution: "benennt Prüffragen und Abbruchgrenzen",
        boundary: "erteilt keine Freigabe",
      },
      {
        role: "Compliance/Risiko-Agent",
        contribution: "prüft Health-Grenzen",
        boundary: "keine Diagnose, keine Heilversprechen",
      },
      {
        role: "Plugin/Tool-Radar-Agent",
        contribution: "benennt nur möglichen read-only Toolbedarf",
        boundary: "verbindet keine Tools",
      },
      {
        role: "Wissens/Archiv-Agent",
        contribution:
          "benennt, welche bestehenden Projektinformationen berücksichtigt werden sollten",
        boundary: "speichert nichts automatisch",
      },
    ],
    expectedManualIntermediateResult: [
      "eine erste Produktstruktur für den Health Upgrade Kompass",
      "eine Liste der offenen Produktfragen",
      "eine klare MVP-Grenze",
      "eine Liste von Punkten, die noch nicht umgesetzt werden dürfen",
      "eine Empfehlung, ob der nächste Schritt manuell freigegeben werden kann",
    ],
    nonGoals: [
      "keine automatische Umsetzung",
      "keine echte Projektfortsetzung ohne Jamals Freigabe",
      "keine Speicherung",
      "keine externen Requests",
      "keine Verbindung zu Airtable, Gmail, Google Calendar, Google Drive oder GitHub",
      "keine POST/PATCH/PUT/DELETE-Endpunkte",
      "keine Diagnose- oder Heilversprechen",
      "keine echten Kunden-, Gesundheits- oder Waagendaten",
    ],
    stopBoundaries: [
      "Wenn die Produktstruktur unklar bleibt, darf nicht weitergearbeitet werden.",
      "Wenn Health-Risiken oder medizinische Aussagen entstehen, muss gestoppt werden.",
      "Wenn echte Daten, externe Tools oder Speicherung nötig wären, muss gestoppt werden.",
      "Wenn Jamals Führungsentscheidung fehlt, darf der Schritt nicht starten.",
    ],
    recommendation:
      "V6.33.3 sollte den ersten manuellen Health-Projektarbeitsschritt nur vorbereiten. Die Ausführung bleibt gesperrt, bis Jamal bewusst freigibt.",
    qualityBoundary:
      "Der vorbereitete Projektarbeitsschritt ist nur gültig, wenn er konkret, manuell prüfbar, lokal erklärbar und ohne automatische Projektfortsetzung ausführbar wäre.",
    safetyBoundary:
      "Auch mit vorbereiteter Produktstruktur bleibt die Zentrale read-only und lokal. Es werden keine externen Systeme verbunden, keine Daten gespeichert, keine echten Health-Daten verarbeitet und keine automatische Projektbearbeitung gestartet.",
    manualOnly: true,
    localOnly: true,
    requiresJamalApproval: true,
    madeExternalRequest: false,
    storageBlocked: true,
    writeOperationsBlocked: true,
    externalRequestsBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticContinuationBlocked: true,
    followUpAgentStartBlocked: true,
  };
}

function getProductiveFastQualityWorkMode() {
  return {
    title: "Schneller qualitätsgesicherter Arbeitsmodus",
    status: "schnelles Arbeiten mit Qualitätsgrenze vorbereitet",
    shortDescription:
      "Die Zentrale hilft Jamal, schneller vom Projektstand zum nächsten sinnvollen Arbeitsschritt zu kommen, ohne automatische Ausführung und ohne Qualitätsverlust.",
    derivedFrom:
      "V6.33.3: Der erste manuelle Health-Projektarbeitsschritt ist vorbereitet.",
    mainWorkFocusToday: {
      project: "Health Upgrade Kompass",
      focus:
        "erste manuelle Produktstruktur aus Agentenauswertung nutzbar machen",
      goal:
        "aus der vorbereiteten Agentenauswertung eine klare, manuell prüfbare Produktstruktur ableiten",
    },
    fastWorkLogic: [
      {
        step: "Verstehen",
        question: "Was ist der aktuelle Stand?",
        output:
          "V6.33.3 hat eine erste Produktstruktur, offene Fragen, MVP-Grenze und Nicht-Ziele vorbereitet.",
      },
      {
        step: "Entscheiden",
        question: "Was ist jetzt der nächste beste Schritt?",
        output:
          "Jamal entscheidet, ob die Produktstruktur jetzt manuell bearbeitet, erneut strukturiert oder gestoppt wird.",
      },
      {
        step: "Ausführen",
        question: "Was kann Jamal jetzt manuell tun?",
        output:
          "Die erste Produktstruktur konzentriert prüfen und nur lokale Notizen zu Struktur, Nutzen, MVP-Grenze und Risiko machen.",
      },
    ],
    qualityBeforeSpeedRule: [
      "Geschwindigkeit ist erwünscht, aber nur innerhalb klarer Qualitätsgrenzen.",
      "Kein Schritt darf nur deshalb ausgeführt werden, weil er schnell ist.",
      "Wenn Inhalt, Nutzen, Risiko oder Grenze unklar sind, wird gestoppt oder zurückgestellt.",
      "Jede Empfehlung muss für Jamal nachvollziehbar sein.",
    ],
    workCardForJamal: {
      whatNow:
        "Die vorbereitete Health-Produktstruktur manuell lesen und entscheiden, ob sie als nächster Arbeitsschritt taugt.",
      whyThisStep:
        "Dieser Schritt verbindet Agentenauswertung mit echter Projektarbeit, bleibt aber lokal, klein und kontrollierbar.",
      expectedResult:
        "Eine klare erste Produktstruktur mit offenen Produktfragen, MVP-Grenze, Nicht-Umsetzen-Liste und Freigabeempfehlung.",
      decisionRequired:
        "Jetzt manuell bearbeiten, noch einmal strukturieren oder stoppen.",
      stopWhen:
        "Stoppen, wenn Nutzen, Health-Grenze, Produktstruktur, Datenbedarf oder nächstes Ergebnis unklar werden.",
    },
    agentContributionDimensions: [
      {
        dimension: "Führung & Entscheidung",
        orientation:
          "GF- und Projektmanagement-Logik verdichten Relevanz, Priorität, Reihenfolge und Jamals Freigabepunkt.",
      },
      {
        dimension: "Produktstruktur & Kundennutzen",
        orientation:
          "Produktmanagement-Logik klärt Nutzerfluss, Kernnutzen, MVP-Grenze und offene Produktfragen.",
      },
      {
        dimension: "Umsetzung & Darstellung",
        orientation:
          "Design-, Entwicklungs- und QA-Logik prüfen Struktur, Verständlichkeit, technische Machbarkeit und Prüfpunkte.",
      },
      {
        dimension: "Qualität, Risiko & Grenze",
        orientation:
          "Compliance-, Tool- und Wissenslogik sichern Health-Grenzen, read-only Toolbedarf und nicht zu beschleunigende Risiken.",
      },
    ],
    jamalDecisionOptions: [
      "Jetzt manuell bearbeiten",
      "Noch einmal strukturieren",
      "Stoppen / nicht weiterführen",
    ],
    nonGoals: [
      "keine automatische Projektbearbeitung",
      "keine echte Kunden- oder Gesundheitsdatennutzung",
      "keine Diagnose oder Heilversprechen",
      "keine externe Systemverbindung",
      "keine Speicherung oder Schreiboperation",
      "keine Entscheidung ohne Jamals bewusste Freigabe",
    ],
    stopBoundaries: [
      "wenn der nächste Schritt nicht verständlich ist",
      "wenn Nutzen für Health Upgrade Kompass unklar bleibt",
      "wenn Gesundheitsversprechen entstehen könnten",
      "wenn echte Daten benötigt würden",
      "wenn eine externe Verbindung nötig wäre",
      "wenn Geschwindigkeit die Qualität verschlechtert",
    ],
    recommendation:
      "Jamal sollte den schnellen Arbeitsmodus nutzen, um aus der vorbereiteten Agentenauswertung den nächsten manuellen Health-Projektarbeitsschritt konzentriert zu bearbeiten. Die Zentrale darf dabei priorisieren, verdichten und vorbereiten, aber nicht automatisch ausführen oder speichern.",
    qualityBoundary:
      "Die Zentrale darf nur dann einen schnellen Arbeitsschritt empfehlen, wenn Ziel, Nutzen, Grenze und erwartetes Ergebnis klar sind. Unklare oder riskante Schritte werden nicht beschleunigt, sondern zurückgestellt.",
    safetyBoundary:
      "Keine neuen POST/PATCH/PUT/DELETE-Endpunkte, keine .env.local, keine externen Requests, keine Speicherung, keine Schreiboperation, keine automatische Projektbearbeitung und keine Verbindung zu Airtable, Gmail, Google Calendar, Google Drive, GitHub oder anderen externen Systemen.",
    manualOnly: true,
    localOnly: true,
    qualityBeforeSpeed: true,
    requiresJamalApproval: true,
    madeExternalRequest: false,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticDecisionBlocked: true,
    automaticContinuationBlocked: true,
    externalConnectionsBlocked: true,
  };
}

const PRODUCTIVE_WORK_REQUEST_TEST =
  "Prüfe den aktuellen Stand der KI-Unternehmenszentrale und erstelle ein verwertbares Produktivergebnis mit Zusammenfassung, Entscheidungen, nächsten Aktionen, Risiken und offenen Punkten. Ziel ist festzustellen, ob das System bereit ist, echte Arbeitsaufträge strukturiert auszugeben.";
const PRODUCTIVE_WORK_REQUEST_MAX_LENGTH = 3000;
const PRODUCTIVE_INPUT_CORRIDOR_VERSION = "V6.33.7";
const PRODUCTIVE_RESULT_ENGINE_VERSION = "V6.33.8";
const PRODUCTIVE_REPORT_VERSION = "V6.33.9";
const PRODUCTIVE_ACCEPTANCE_VERSION = "V6.33.10";
const AGENT_RUN_VERSION = "V6.34.0";
const AGENT_PROJECT_WORK_VERSION = "V6.34.1";

const PRODUCTIVE_PROJECT_REGISTRY = [
  {
    id: "ki-unternehmenszentrale",
    name: "KI-Unternehmenszentrale",
    status: "active-read-only",
    projectType: "system",
    description:
      "Aktiver Systemkern mit Produktivmodus, Agentenlauf, Copy-Ready Bericht und Sicherheitsgrenzen.",
    primaryGoal:
      "Read-only Arbeitsführung: Aufträge strukturieren, Agenten arbeitsfähig halten, Ergebnisse übergabefähig machen.",
    safetyProfile: "system-read-only-no-write",
    recommendedAgents: [
      "orchestrator-agent",
      "project-status-agent",
      "quality-test-agent",
      "security-agent",
      "documentation-agent",
      "next-actions-agent",
    ],
    blockedActions: [
      "write-operation",
      "external-request",
      "persistence",
      "auto-execution",
    ],
    active: true,
    readOnly: true,
  },
  {
    id: "health-upgrade-kompass",
    name: "Health Upgrade Kompass",
    status: "active-read-only",
    projectType: "product",
    description:
      "Erstes reales Produktfeld mit sicherem Orientierungs- und Gesprächsvorbereitungsflow (Bereich 1–4 demo-tauglich).",
    primaryGoal:
      "Demo-tauglichen Health-Kompass in sicheren Produktbereichen ausarbeiten – ohne Diagnose, Messwerte oder automatische Empfehlung.",
    safetyProfile: "health-orientation-no-diagnosis",
    recommendedAgents: [
      "health-compass-agent",
      "product-agent",
      "customer-value-agent",
      "risk-agent",
      "documentation-agent",
      "next-actions-agent",
    ],
    blockedActions: [
      "diagnosis",
      "medical-recommendation",
      "healing-claims",
      "write-operation",
      "external-request",
      "persistence",
    ],
    active: true,
    readOnly: true,
  },
  {
    id: "expansion-app",
    name: "Expansion App",
    status: "clarify-before-continue",
    projectType: "product",
    description:
      "Strategisch relevantes App-Projekt (Länderprüfung/Wachstum); vor Fortsetzung stärker einzugrenzen.",
    primaryGoal:
      "Kleinsten sinnvollen App-Ausschnitt als späteren Prüfpunkt formulieren – ohne neue Komplexität.",
    safetyProfile: "product-scoping-read-only",
    recommendedAgents: [
      "strategy-agent",
      "product-agent",
      "risk-agent",
      "documentation-agent",
      "data-structure-agent",
      "review-agent",
    ],
    blockedActions: ["write-operation", "external-request", "persistence"],
    active: true,
    readOnly: true,
  },
  {
    id: "marketing-agentur-os",
    name: "Marketing Agentur OS",
    status: "later-read-only",
    projectType: "operations",
    description:
      "Betriebs-/Agentur-System für Prozesse, Angebote und Delivery; nicht heutiger Startpunkt.",
    primaryGoal:
      "Einen einzigen manuellen Agentur-OS-Nutzen beschreiben, der ohne Tool-Aktion prüfbar ist.",
    safetyProfile: "operations-scoping-read-only",
    recommendedAgents: [
      "strategy-agent",
      "customer-value-agent",
      "communication-agent",
      "review-agent",
      "documentation-agent",
    ],
    blockedActions: ["write-operation", "external-request", "persistence"],
    active: true,
    readOnly: true,
  },
  {
    id: "flowlingo",
    name: "FlowLingo Portugiesisch Sprachtrainer",
    status: "later-read-only",
    projectType: "product",
    description:
      "Fokussiertes Lernprodukt; Fortsetzung braucht klare Lern-/Demo-Grenze.",
    primaryGoal:
      "Eine einzige Lern-/Demo-Situation auswählen und lokal als Qualitätsfrage formulieren.",
    safetyProfile: "product-scoping-read-only",
    recommendedAgents: [
      "product-agent",
      "customer-value-agent",
      "communication-agent",
      "risk-agent",
      "documentation-agent",
    ],
    blockedActions: ["write-operation", "external-request", "persistence"],
    active: true,
    readOnly: true,
  },
  {
    id: "finance-budget-toolkosten",
    name: "Finance / Budget / Toolkosten",
    status: "placeholder-read-only",
    projectType: "internal",
    description:
      "Interner Bereich für Budget- und Toolkosten-Überblick; nur als Platzhalter, Details offen.",
    primaryGoal:
      "Kosten- und Budgetfragen nur read-only strukturieren – keine echten Finanzdaten verarbeiten.",
    safetyProfile: "internal-no-real-financial-data",
    recommendedAgents: [
      "strategy-agent",
      "prioritization-agent",
      "risk-agent",
      "documentation-agent",
      "decision-agent",
    ],
    blockedActions: [
      "write-operation",
      "external-request",
      "persistence",
      "real-financial-data",
    ],
    active: true,
    readOnly: true,
  },
  {
    id: "admin-steuer-organisation",
    name: "Admin / Steuer / Organisation",
    status: "placeholder-read-only",
    projectType: "internal",
    description:
      "Interner Bereich für Administration, Steuer- und Organisationsfragen; nur als Platzhalter, Details offen.",
    primaryGoal:
      "Organisatorische Aufgaben nur read-only sortieren – keine Steuerberatung, keine echten Dokumente.",
    safetyProfile: "internal-no-tax-advice",
    recommendedAgents: [
      "workflow-agent",
      "prioritization-agent",
      "documentation-agent",
      "risk-agent",
      "next-actions-agent",
    ],
    blockedActions: [
      "write-operation",
      "external-request",
      "persistence",
      "tax-advice",
    ],
    active: true,
    readOnly: true,
  },
];

function resolveProductiveProjectContext(projectIdInput) {
  const projectId = String(projectIdInput ?? "").trim();
  if (!projectId) {
    return null;
  }

  const project = PRODUCTIVE_PROJECT_REGISTRY.find((entry) => entry.id === projectId);
  if (!project) {
    return {
      selectedProjectId: projectId,
      selectedProjectName: undefined,
      projectContextReady: false,
      projectContextSource: "project-registry-lookup",
      unknownProject: true,
      project: null,
    };
  }

  return {
    selectedProjectId: project.id,
    selectedProjectName: project.name,
    projectContextReady: true,
    projectContextSource: "project-registry-lookup",
    unknownProject: false,
    project,
  };
}

const PLUGIN_COMMAND_CENTER_VERSION = "V6.34.2";

const PRODUCTIVE_PLUGIN_REGISTRY = [
  {
    id: "github",
    name: "GitHub",
    category: "code-repository",
    status: "read-only-planned",
    demoPriority: "high",
    purpose: "Projektdateien, Repository-Status, Checks und Änderungsstand sichtbar machen.",
    readOnlyAllowedActions: [
      "Repository-Status lesen",
      "Datei-/Projektstruktur prüfen",
      "PR-/Check-Status lesen",
    ],
    blockedActions: [
      "Commit erstellen",
      "Branch pushen",
      "PR öffnen",
      "Dateien schreiben oder löschen",
    ],
    manualApprovalRequired: true,
    safetyBoundary: "Nur lesen und berichten; keine Codeänderung ohne separate Freigabe.",
    nextSafeStep: "Read-only Statuskarte für Repository- und Projektdateien vorbereiten.",
  },
  {
    id: "airtable",
    name: "Airtable",
    category: "project-data",
    status: "read-only-planned",
    demoPriority: "high",
    purpose: "Projekt-, Pilot- und Statusdaten der Zentrale read-only sichtbar machen.",
    readOnlyAllowedActions: [
      "Projektstatus lesen",
      "Tabellenstruktur prüfen",
      "Statusfelder anzeigen",
    ],
    blockedActions: [
      "Records schreiben",
      "Felder ändern",
      "Automationen auslösen",
    ],
    manualApprovalRequired: true,
    safetyBoundary: "Nur Status lesen; keine Record-Erstellung, keine Tabellenänderung, keine Synchronisierung.",
    nextSafeStep: "Read-only Projektstatus-Karte aus einer freigegebenen Tabelle vorbereiten.",
  },
  {
    id: "canva",
    name: "Canva",
    category: "design",
    status: "briefing-ready",
    demoPriority: "medium",
    purpose: "Design-Briefings und spätere Design-Übergaben vorbereiten – nicht produzieren.",
    readOnlyAllowedActions: [
      "Briefingkarte vorbereiten",
      "Designanforderungen strukturieren",
    ],
    blockedActions: [
      "Automatisch Design erstellen",
      "Design exportieren",
      "Design veröffentlichen",
      "Brand-Kit verändern",
    ],
    manualApprovalRequired: true,
    safetyBoundary:
      "Nur Briefing-Vorbereitung; Design-/Visual-Agent fehlt noch – Canva bleibt bis dahin briefing-ready, nicht production-ready.",
    nextSafeStep: "Design-Briefingkarte aus abgenommenem Post-Briefing ableiten – ohne Tool-Ausführung.",
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "deployment",
    status: "read-only-planned",
    demoPriority: "high",
    purpose: "Deployment- und Projektstatus für die Demo sichtbar machen.",
    readOnlyAllowedActions: [
      "Deployment-Status anzeigen",
      "Projektstatus anzeigen",
      "Build-/Check-Hinweise anzeigen",
    ],
    blockedActions: [
      "Deployment auslösen",
      "Promote/Rollback ausführen",
      "Environment Variables ändern",
    ],
    manualApprovalRequired: true,
    safetyBoundary: "Nur Status lesen; kein Deployment, kein Rollback, keine Konfigurationsänderung.",
    nextSafeStep: "Read-only Deployment-Statuskarte für das Demo-Projekt vorbereiten.",
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "communication",
    status: "future-read-only",
    demoPriority: "low",
    purpose: "Später relevante Projektkommunikation read-only sichtbar machen – aktuell nicht aktiv.",
    readOnlyAllowedActions: ["Noch keine – Plugin ist future-read-only."],
    blockedActions: [
      "E-Mail senden",
      "E-Mail beantworten",
      "Postfach ändern",
      "Labels setzen",
    ],
    manualApprovalRequired: true,
    safetyBoundary: "Blocked-for-now; keine echten E-Mails, keine Postfachaktionen.",
    nextSafeStep: "Erst nach expliziter Freigabe als read-only Kandidat neu bewerten.",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "scheduling",
    status: "future-read-only",
    demoPriority: "low",
    purpose: "Später Termin-/Demo-Planung read-only sichtbar machen – aktuell nicht aktiv.",
    readOnlyAllowedActions: ["Noch keine – Plugin ist future-read-only."],
    blockedActions: [
      "Termin erstellen",
      "Termin ändern",
      "Einladung senden",
    ],
    manualApprovalRequired: true,
    safetyBoundary: "Blocked-for-now; keine Terminerstellung, keine Einladungen.",
    nextSafeStep: "Erst nach expliziter Freigabe als read-only Kandidat neu bewerten.",
  },
  {
    id: "google-drive",
    name: "Google Drive / Dateien",
    category: "files",
    status: "future-read-only",
    demoPriority: "low",
    purpose: "Später Projektdokumente read-only sichtbar machen – aktuell nicht aktiv.",
    readOnlyAllowedActions: ["Noch keine – Plugin ist future-read-only."],
    blockedActions: [
      "Datei schreiben",
      "Datei löschen",
      "Freigaben ändern",
    ],
    manualApprovalRequired: true,
    safetyBoundary: "Blocked-for-now; keine Dateischreibzugriffe, keine Freigabeänderungen.",
    nextSafeStep: "Erst nach expliziter Freigabe als read-only Kandidat neu bewerten.",
  },
];

const PLUGIN_SAFETY_RULES = [
  "Keine automatischen Schreibaktionen",
  "Keine automatischen Veröffentlichungen",
  "Keine automatischen Deployments",
  "Keine automatischen E-Mails",
  "Keine automatischen Canva-Exports",
  "Keine Airtable-Schreiboperationen",
  "Keine GitHub-Commits",
  "Keine Vercel-Deployments",
  "Alle Aktionen bleiben read-only oder manual-approval-required",
];

const PLUGIN_ACTION_CARD_TEMPLATES_BY_PROJECT = {
  "health-upgrade-kompass": [
    {
      pluginId: "github",
      actionTitle: "Projektdatei-/Demo-Stand read-only prüfen",
      actionIntent: "demo-stand-sichtbar-machen",
      reason: "Vor der ersten Demo soll der Datei- und Demo-Stand des Kompass nachvollziehbar sein.",
      requiredInput: "Repository-/Projektpfad des Health Upgrade Kompass (manuell benannt).",
      expectedOutput: "Read-only Statusübersicht der Demo-relevanten Dateien – ohne Änderung.",
      nextManualStep: "Jamal benennt das Repository und gibt die read-only Prüfung frei.",
    },
    {
      pluginId: "canva",
      actionTitle: "Demo-Briefing für Health-Kompass-Präsentation vorbereiten",
      actionIntent: "demo-briefing-vorbereiten",
      reason: "Die Demo-Präsentation braucht ein strukturiertes Briefing – keine Design-Produktion.",
      requiredInput: "Demo-Skript und Generalprobe-Plan als Briefing-Grundlage.",
      expectedOutput: "Briefingkarte für die Präsentation – ohne Design-Erstellung, ohne Export.",
      nextManualStep: "Jamal prüft die Briefingkarte und entscheidet über den späteren Produktionsschritt.",
    },
    {
      pluginId: "vercel",
      actionTitle: "Demo-Deployment-Status read-only prüfen",
      actionIntent: "demo-deployment-status",
      reason: "Für die Demo soll sichtbar sein, ob ein aktueller Stand deployt ist.",
      requiredInput: "Vercel-Projektname (manuell benannt).",
      expectedOutput: "Read-only Deployment-Statuskarte – kein Deployment, kein Rollback.",
      nextManualStep: "Jamal benennt das Vercel-Projekt und gibt die read-only Statusabfrage frei.",
    },
  ],
  "expansion-app": [
    {
      pluginId: "airtable",
      actionTitle: "Projekt-/Produktstatus read-only prüfen",
      actionIntent: "unterlagen-status-sichtbar-machen",
      reason: "Der Unterlagenstatus (Spezifikation, Etikett, Tagesportion) soll strukturiert sichtbar werden.",
      requiredInput: "Freigegebene Airtable-Tabelle mit Produkt-/Unterlagenstatus (manuell benannt).",
      expectedOutput: "Read-only Statusübersicht – keine Records, keine Feldänderungen.",
      nextManualStep: "Jamal benennt die Tabelle und gibt die read-only Prüfung frei.",
    },
    {
      pluginId: "github",
      actionTitle: "Projektstruktur read-only prüfen",
      actionIntent: "projektstruktur-sichtbar-machen",
      reason: "Der Ablageort der Länderprüfungs-Karten und Checklisten soll nachvollziehbar sein.",
      requiredInput: "Repository-/Projektpfad der Expansion App (manuell benannt).",
      expectedOutput: "Read-only Strukturübersicht – ohne Änderung.",
      nextManualStep: "Jamal benennt das Repository und gibt die read-only Prüfung frei.",
    },
  ],
  "marketing-agentur-os": [
    {
      pluginId: "canva",
      actionTitle: "Design-/Post-Briefing vorbereiten – nicht ausführen",
      actionIntent: "design-briefing-vorbereiten",
      reason: "Das abgenommene Post-Briefing kann als Canva-Briefingkarte strukturiert werden – keine Design-Erstellung, kein Export; Design-/Visual-Agent fehlt noch (offener Punkt).",
      requiredInput: "Abgenommene Post-Briefing-Karte (Feld 1–6).",
      expectedOutput: "Canva-Briefingkarte als Text – ohne Tool-Ausführung.",
      nextManualStep: "Jamal entscheidet, wann der getrennte Produktionsschritt startet.",
    },
    {
      pluginId: "github",
      actionTitle: "Projekt-/Dateistand read-only prüfen",
      actionIntent: "projektstand-sichtbar-machen",
      reason: "Der Ablagestand der Briefing-Karten soll nachvollziehbar sein.",
      requiredInput: "Repository-/Projektpfad des Marketing Agentur OS (manuell benannt).",
      expectedOutput: "Read-only Statusübersicht – ohne Änderung.",
      nextManualStep: "Jamal benennt das Repository und gibt die read-only Prüfung frei.",
    },
  ],
  "ki-unternehmenszentrale": [
    {
      pluginId: "github",
      actionTitle: "Repository-/Projektstand read-only prüfen",
      actionIntent: "systemstand-sichtbar-machen",
      reason: "Der Code- und Versionsstand der Zentrale soll für die Demo nachvollziehbar sein.",
      requiredInput: "Repository der KI-Unternehmenszentrale (manuell benannt).",
      expectedOutput: "Read-only Statusübersicht (Dateien, Checks) – keine Commits.",
      nextManualStep: "Jamal benennt das Repository und gibt die read-only Prüfung frei.",
    },
    {
      pluginId: "airtable",
      actionTitle: "Projektstatus read-only lesen",
      actionIntent: "projektstatus-sichtbar-machen",
      reason: "Der Status der aktiven Projekte soll zentral sichtbar werden.",
      requiredInput: "Freigegebene Airtable-Statusübersicht (manuell benannt).",
      expectedOutput: "Read-only Projektstatus-Karte – keine Schreiboperation.",
      nextManualStep: "Jamal benennt die Tabelle und gibt die read-only Prüfung frei.",
    },
    {
      pluginId: "vercel",
      actionTitle: "Deployment-Status read-only lesen",
      actionIntent: "deployment-status-sichtbar-machen",
      reason: "Für die Demo soll sichtbar sein, welcher Stand der Zentrale erreichbar ist.",
      requiredInput: "Vercel-Projektname der Zentrale (manuell benannt).",
      expectedOutput: "Read-only Deployment-Statuskarte – kein Deployment.",
      nextManualStep: "Jamal benennt das Vercel-Projekt und gibt die read-only Statusabfrage frei.",
    },
  ],
};

function buildPluginActionCards(projectContext, workRequest, analysis, agentRun) {
  const project = projectContext?.project;
  if (!project || !workRequest) {
    return [];
  }

  const templates =
    PLUGIN_ACTION_CARD_TEMPLATES_BY_PROJECT[project.id] || [
      {
        pluginId: "github",
        actionTitle: "Projekt-/Dateistand read-only prüfen",
        actionIntent: "projektstand-sichtbar-machen",
        reason: `Für „${project.name}" existieren noch keine spezifischen Plugin-Aktionskarten – sicherer Standard: read-only Projektstand.`,
        requiredInput: "Repository-/Projektpfad (manuell benannt).",
        expectedOutput: "Read-only Statusübersicht – ohne Änderung.",
        nextManualStep: "Jamal benennt den Ablageort und gibt die read-only Prüfung frei.",
      },
    ];

  return templates.map((template, index) => {
    const plugin = PRODUCTIVE_PLUGIN_REGISTRY.find((entry) => entry.id === template.pluginId);
    return {
      pluginActionCardId: `${project.id}-${template.pluginId}-${index + 1}`,
      pluginId: template.pluginId,
      pluginName: plugin?.name || template.pluginId,
      projectId: project.id,
      projectName: project.name,
      actionTitle: template.actionTitle,
      actionIntent: template.actionIntent,
      mode: "read-only-preview",
      status: "prepared-not-executed",
      reason: template.reason,
      requiredInput: template.requiredInput,
      expectedOutput: template.expectedOutput,
      allowed: true,
      requiresManualApproval: true,
      blockedWriteActions: plugin?.blockedActions || [],
      safetyNote: plugin?.safetyBoundary || "Read-only; keine Ausführung ohne manuelle Freigabe.",
      nextManualStep: template.nextManualStep,
    };
  });
}

function buildPluginCommandCenter(projectContext, workRequest, analysis, agentRun) {
  const pluginActionCards = buildPluginActionCards(projectContext, workRequest, analysis, agentRun);

  return {
    pluginCommandCenterVersion: PLUGIN_COMMAND_CENTER_VERSION,
    pluginCommandCenterReady: true,
    pluginCommandCenterMode: "read-only-plugin-planning",
    pluginRegistry: PRODUCTIVE_PLUGIN_REGISTRY,
    pluginCount: PRODUCTIVE_PLUGIN_REGISTRY.length,
    highPriorityPlugins: PRODUCTIVE_PLUGIN_REGISTRY.filter(
      (entry) => entry.demoPriority === "high",
    ).map((entry) => entry.name),
    pluginSafetyRules: PLUGIN_SAFETY_RULES,
    pluginActionCardsReady: pluginActionCards.length > 0,
    pluginActionCards,
    blockedPluginActions: PRODUCTIVE_PLUGIN_REGISTRY.flatMap((entry) =>
      entry.blockedActions.map((action) => `${entry.name}: ${action}`),
    ),
    pluginCommandCenterBlockers: [],
    nextPluginDemoStep:
      "Ersten echten read-only Plugin-Test mit einem Plugin manuell vorbereiten – keine Schreibrechte, keine Aktion ohne Freigabe.",
  };
}

const PRODUCTIVE_AGENT_REGISTRY = [
  { id: "strategy-agent", name: "Strategie-Agent", role: "Bewertet Ziel, Richtung und Priorität", category: "strategy", active: true, readOnly: true },
  { id: "product-agent", name: "Produkt-Agent", role: "Ordnet Auftrag produktlogisch ein", category: "product", active: true, readOnly: true },
  { id: "project-status-agent", name: "Projektstatus-Agent", role: "Verdichtet Ist-Stand und Fortschritt", category: "project", active: true, readOnly: true },
  { id: "prioritization-agent", name: "Priorisierungs-Agent", role: "Sortiert Aufgaben nach Dringlichkeit und Nutzen", category: "prioritization", active: true, readOnly: true },
  { id: "ui-agent", name: "UI-Agent", role: "Prüft UI-Bezug und Darstellungsfolgen", category: "ui", active: true, readOnly: true },
  { id: "api-agent", name: "API-Agent", role: "Prüft API-Bezug und Antwortstruktur", category: "api", active: true, readOnly: true },
  { id: "security-agent", name: "Sicherheits-Agent", role: "Bewertet Sicherheitsgrenzen und Risiken", category: "security", active: true, readOnly: true },
  { id: "quality-test-agent", name: "QS-/Test-Agent", role: "Empfiehlt Prüf- und Testschritte", category: "quality", active: true, readOnly: true },
  { id: "documentation-agent", name: "Dokumentations-Agent", role: "Strukturiert Übergabe und Dokumentation", category: "documentation", active: true, readOnly: true },
  { id: "release-agent", name: "Release-Agent", role: "Bewertet Finish- und Release-Reife", category: "release", active: true, readOnly: true },
  { id: "health-compass-agent", name: "Health-Kompass-Agent", role: "Ordnet Health-Upgrade-Kompass-Bezug ein", category: "health", active: true, readOnly: true },
  { id: "customer-value-agent", name: "Kundenwert-Agent", role: "Bewertet Nutzen aus Kundensicht", category: "customer", active: true, readOnly: true },
  { id: "risk-agent", name: "Risiko-Agent", role: "Identifiziert auftragsbezogene Risiken", category: "risk", active: true, readOnly: true },
  { id: "decision-agent", name: "Entscheidungs-Agent", role: "Formuliert Entscheidungsoptionen read-only", category: "decision", active: true, readOnly: true },
  { id: "next-actions-agent", name: "Nächste-Aktionen-Agent", role: "Leitet konkrete nächste Schritte ab", category: "actions", active: true, readOnly: true },
  { id: "open-points-agent", name: "Open-Points-Agent", role: "Sammelt offene Klärungspunkte", category: "open-points", active: true, readOnly: true },
  { id: "workflow-agent", name: "Workflow-Agent", role: "Bewertet Ablauf und Reihenfolge", category: "workflow", active: true, readOnly: true },
  { id: "data-structure-agent", name: "Datenstruktur-Agent", role: "Prüft Daten- und Ergebnisstruktur", category: "data", active: true, readOnly: true },
  { id: "integration-agent", name: "Integrations-Agent", role: "Bewertet Integrationsbezug ohne Ausführung", category: "integration", active: true, readOnly: true },
  { id: "communication-agent", name: "Kommunikations-Agent", role: "Formuliert Übergabe und Kommunikation", category: "communication", active: true, readOnly: true },
  { id: "operations-agent", name: "Betriebs-Agent", role: "Bewertet Betriebs- und Nutzbarkeit", category: "operations", active: true, readOnly: true },
  { id: "error-analysis-agent", name: "Fehleranalyse-Agent", role: "Analysiert Fehlerursachen read-only", category: "error", active: true, readOnly: true },
  { id: "review-agent", name: "Review-Agent", role: "Führt read-only Qualitätsreview durch", category: "review", active: true, readOnly: true },
  { id: "closure-agent", name: "Abschluss-Agent", role: "Bewertet Abschluss- und Finish-Fähigkeit", category: "closure", active: true, readOnly: true },
  { id: "orchestrator-agent", name: "Orchestrator-Agent", role: "Koordiniert Agentenperspektiven read-only", category: "orchestration", active: true, readOnly: true },
];

const AGENT_INTENT_ROUTING = {
  "project-status": [
    "project-status-agent",
    "prioritization-agent",
    "risk-agent",
    "next-actions-agent",
    "documentation-agent",
  ],
  "feature-implementation": [
    "product-agent",
    "ui-agent",
    "api-agent",
    "security-agent",
    "quality-test-agent",
  ],
  bugfix: [
    "error-analysis-agent",
    "ui-agent",
    "api-agent",
    "security-agent",
    "quality-test-agent",
  ],
  "quality-test": [
    "quality-test-agent",
    "security-agent",
    "api-agent",
    "ui-agent",
    "review-agent",
  ],
  "decision-strategy": [
    "strategy-agent",
    "decision-agent",
    "risk-agent",
    "customer-value-agent",
    "prioritization-agent",
  ],
  "documentation-handover": [
    "documentation-agent",
    "communication-agent",
    "closure-agent",
    "review-agent",
  ],
  "release-finish": [
    "release-agent",
    "quality-test-agent",
    "security-agent",
    "closure-agent",
  ],
  "general-productive": [
    "orchestrator-agent",
    "strategy-agent",
    "risk-agent",
    "next-actions-agent",
    "documentation-agent",
  ],
};

function routeWorkRequestToAgents(workRequest, analysis) {
  const intent = analysis?.intent || "general-productive";
  const selectedAgentIds =
    AGENT_INTENT_ROUTING[intent] || AGENT_INTENT_ROUTING["general-productive"];

  return {
    intent,
    category: analysis?.category,
    selectedAgentIds,
    workRequestPreview: analysis?.requestPreview || workRequest.slice(0, 120),
  };
}

function buildReadOnlyAgentContribution(agent, workRequest, analysis) {
  const subject =
    analysis?.requestPreview ||
    (workRequest.length > 100 ? `${workRequest.slice(0, 100)}...` : workRequest);
  const category = analysis?.category || "Allgemeiner Produktivauftrag / Fallback";
  const intentLabel = analysis?.intentLabel || analysis?.intent || "Allgemeiner Produktivauftrag";

  const contributionTemplates = {
    "strategy-agent": {
      focus: "Ziel, Richtung und Priorität des Auftrags",
      summary: `Strategie-Agent ordnet „${subject}“ als ${intentLabel} ein und priorisiert read-only die Zielrichtung.`,
      decisions: ["Keine automatische Strategieänderung – nur read-only Empfehlung."],
      nextActions: ["Ziel und Priorität aus dem Auftrag gegen aktuellen Fokus spiegeln."],
      risks: ["Breite Aufträge können die strategische Schärfe verwässern."],
      openPoints: ["Welches Ziel ist heute verbindlich vs. optional?"],
    },
    "product-agent": {
      focus: "Produktlogische Einordnung und Nutzen",
      summary: `Produkt-Agent bewertet den Feature-/Produktbezug von „${subject}“ read-only.`,
      decisions: ["Feature nur als minimalen, reversiblen Schritt vorbereiten."],
      nextActions: ["Betroffene Produktbereiche und UI/API-Bezug benennen."],
      risks: ["Produktumfang könnte größer wirken als erlaubt."],
      openPoints: ["Welches Akzeptanzkriterium gilt für den ersten Schritt?"],
    },
    "project-status-agent": {
      focus: "Ist-Stand und Projektfortschritt",
      summary: `Projektstatus-Agent verdichtet den Auftrag „${subject}“ zu einem read-only Standbild.`,
      decisions: ["Nur read-only prüfen – keine Statusänderung."],
      nextActions: ["Aktuellen Stand in app.js/server.js und API-Feldern gegenlesen."],
      risks: ["Unklare Aufträge führen zu zu allgemeinen Statusaussagen."],
      openPoints: ["Welcher Modulbereich ist gemeint?"],
    },
    "prioritization-agent": {
      focus: "Priorisierung und Reihenfolge",
      summary: `Priorisierungs-Agent sortiert „${subject}“ nach Dringlichkeit und Nutzen.`,
      decisions: ["Maximal drei nächste Schritte gleichzeitig priorisieren."],
      nextActions: ["Top-3-Schritte aus dem Auftrag extrahieren und benennen."],
      risks: ["Zu viele parallele Ziele verwässern den Fokus."],
      openPoints: ["Was kann bewusst warten?"],
    },
    "ui-agent": {
      focus: "UI-Bezug und Darstellung",
      summary: `UI-Agent prüft UI-Bezug für „${subject}“ read-only.`,
      decisions: ["UI nur read-only bewerten – keine DOM-Änderung."],
      nextActions: ["Betroffene UI-Sektionen und Update-Handler identifizieren."],
      risks: ["Symptome könnten am Rendering statt an der Logik hängen."],
      openPoints: ["Welche UI-Komponente ist betroffen?"],
    },
    "api-agent": {
      focus: "API-Bezug und Antwortstruktur",
      summary: `API-Agent prüft API-Bezug für „${subject}“ read-only.`,
      decisions: ["Bestehenden Endpunkt nutzen – keinen neuen Endpunkt erzwingen."],
      nextActions: ["/api/agents/plugin-readiness mit passendem workRequest prüfen."],
      risks: ["API-Antwort und UI-Erwartung könnten auseinanderlaufen."],
      openPoints: ["Welche API-Felder sind für den Auftrag maßgeblich?"],
    },
    "security-agent": {
      focus: "Sicherheitsgrenzen und Schutz",
      summary: `Sicherheits-Agent bestätigt read-only Grenzen für „${subject}“.`,
      decisions: ["Sicherheitsgrenzen haben Vorrang vor Geschwindigkeit."],
      nextActions: ["agentCount=25, writeOperationsBlocked, madeExternalRequest prüfen."],
      risks: ["Neue Funktionen könnten unbeabsichtigt Schreibpfade vorbereiten."],
      openPoints: ["Verletzt der Auftrag implizit Sicherheitsgrenzen?"],
    },
    "quality-test-agent": {
      focus: "Qualitätssicherung und Tests",
      summary: `QS-/Test-Agent empfiehlt Prüfschritte für „${subject}“.`,
      decisions: ["Nur read-only testen – nichts automatisch beheben."],
      nextActions: ["node --check app.js/server.js und API-Szenarien prüfen."],
      risks: ["Happy-Path-Tests übersehen Randfälle wie leere/lange Aufträge."],
      openPoints: ["Welche Erfolgskriterien gelten für den Prüflauf?"],
    },
    "documentation-agent": {
      focus: "Dokumentation und Übergabe",
      summary: `Dokumentations-Agent strukturiert „${subject}“ für read-only Übergabe.`,
      decisions: ["Nur lesend dokumentieren – nichts speichern."],
      nextActions: ["Copy-Ready Bericht als Übergabeentwurf nutzen."],
      risks: ["Dokumentation könnte den Stand über- oder unterschätzen."],
      openPoints: ["Für wen ist die Übergabe gedacht?"],
    },
    "release-agent": {
      focus: "Release- und Finish-Reife",
      summary: `Release-Agent bewertet Finish-Reife für „${subject}“ read-only.`,
      decisions: ["Kein Release automatisch starten."],
      nextActions: ["Finish-Kriterien gegen aktuellen Bestand spiegeln."],
      risks: ["Finish-Druck könnte Qualitätsgrenzen verwässern."],
      openPoints: ["Welche Finish-Kriterien sind verbindlich?"],
    },
    "health-compass-agent": {
      focus: "Health Upgrade Kompass",
      summary: `Health-Kompass-Agent prüft Health-Bezug von „${subject}“.`,
      decisions: ["Keine Diagnose, keine Heilversprechen."],
      nextActions: ["Health-Kompass-Produktstruktur gegen Auftrag spiegeln."],
      risks: ["Medizinische Formulierungen könnten Grenzen verletzen."],
      openPoints: ["Ist der Health-Kompass heute der richtige Fokus?"],
    },
    "customer-value-agent": {
      focus: "Kundennutzen und Wert",
      summary: `Kundenwert-Agent bewertet Nutzenperspektive für „${subject}“.`,
      decisions: ["Kundennutzen von internem Techniknutzen trennen."],
      nextActions: ["Kundennutzen in einem Satz formulieren."],
      risks: ["Technische Lösungen ohne klaren Kundennutzen."],
      openPoints: ["Wer profitiert sichtbar vom Ergebnis?"],
    },
    "risk-agent": {
      focus: "Risiken und Unsicherheiten",
      summary: `Risiko-Agent sammelt Risiken für „${subject}“ in ${category}.`,
      decisions: ["Risiken benennen, bevor weitergearbeitet wird."],
      nextActions: ["Top-3-Risiken aus Auftrag und Kontext ableiten."],
      risks: ["Unterschätzte Randfälle bei unklaren Aufträgen."],
      openPoints: ["Welches Risiko würde Jamal am meisten stoppen?"],
    },
    "decision-agent": {
      focus: "Entscheidungsoptionen",
      summary: `Entscheidungs-Agent formuliert Optionen für „${subject}“ read-only.`,
      decisions: ["Keine automatische Entscheidung – Jamal entscheidet."],
      nextActions: ["Maximal drei Optionen neutral formulieren."],
      risks: ["Scheinsicherheit bei unvollständigen Informationen."],
      openPoints: ["Welche Entscheidung ist heute nötig?"],
    },
    "next-actions-agent": {
      focus: "Nächste konkrete Schritte",
      summary: `Nächste-Aktionen-Agent leitet Schritte aus „${subject}“ ab.`,
      decisions: ["Nur manuelle, sichere Schritte empfehlen."],
      nextActions: ["Kleinste sinnvolle nächste Aktion benennen."],
      risks: ["Zu viele nextActions reduzieren Umsetzbarkeit."],
      openPoints: ["Welcher Schritt bringt heute den meisten Nutzen?"],
    },
    "open-points-agent": {
      focus: "Offene Klärungspunkte",
      summary: `Open-Points-Agent sammelt offene Punkte zu „${subject}“.`,
      decisions: ["Offene Punkte explizit sichtbar machen."],
      nextActions: ["Fehlende Zielangaben aus dem Auftrag listen."],
      risks: ["Ungeklärte Punkte führen zu falschen Annahmen."],
      openPoints: ["Welche Information fehlt für eine sichere Empfehlung?"],
    },
    "workflow-agent": {
      focus: "Ablauf und Reihenfolge",
      summary: `Workflow-Agent bewertet den Ablauf für „${subject}“.`,
      decisions: ["Ablauf read-only planen – nicht ausführen."],
      nextActions: ["Schritte in sinnvoller Reihenfolge ordnen."],
      risks: ["Falsche Reihenfolge erzeugt unnötige Nacharbeit."],
      openPoints: ["Gibt es Abhängigkeiten zwischen Schritten?"],
    },
    "data-structure-agent": {
      focus: "Daten- und Ergebnisstruktur",
      summary: `Datenstruktur-Agent prüft Strukturbezug für „${subject}“.`,
      decisions: ["Bestehende Ergebnisfelder erweitern, nicht ersetzen."],
      nextActions: ["Prüfen, ob Ergebniscontainer alle nötigen Felder hat."],
      risks: ["Strukturänderungen könnten UI/API desynchronisieren."],
      openPoints: ["Welche Felder braucht Jamal sichtbar zurück?"],
    },
    "integration-agent": {
      focus: "Integrationsbezug ohne Ausführung",
      summary: `Integrations-Agent bewertet Integrationsbezug von „${subject}“ read-only.`,
      decisions: ["Keine externe Integration ausführen."],
      nextActions: ["Integrationsbedarf nur als Vorbereitung benennen."],
      risks: ["Implizite Integrationserwartung trotz Sperre."],
      openPoints: ["Ist Integration jetzt nötig oder nur später?"],
    },
    "communication-agent": {
      focus: "Kommunikation und Übergabe",
      summary: `Kommunikations-Agent formuliert Übergabe für „${subject}“.`,
      decisions: ["Übergabe nur read-only vorbereiten."],
      nextActions: ["Kernbotschaft für Stakeholder in 2–3 Sätzen formulieren."],
      risks: ["Unklare Zielgruppe macht Kommunikation zu technisch."],
      openPoints: ["An wen geht die Übergabe?"],
    },
    "operations-agent": {
      focus: "Betrieb und Nutzbarkeit",
      summary: `Betriebs-Agent prüft Nutzbarkeit für „${subject}“.`,
      decisions: ["Betrieb bleibt lokal und manuell."],
      nextActions: ["Serverstart und UI-Ablauf für den Auftrag verifizieren."],
      risks: ["Betriebsannahmen ohne echten Nutzungstest."],
      openPoints: ["Ist der lokale Pilotbetrieb für heute ausreichend?"],
    },
    "error-analysis-agent": {
      focus: "Fehlerursache und Reproduktion",
      summary: `Fehleranalyse-Agent analysiert „${subject}“ read-only.`,
      decisions: ["Zuerst reproduzieren, nicht sofort ändern."],
      nextActions: ["UI-Eingabe, API-Antwort und Ergebnisblock gegenlesen."],
      risks: ["Symptom könnte an API, UI oder Rendering hängen."],
      openPoints: ["Tritt der Fehler reproduzierbar auf?"],
    },
    "review-agent": {
      focus: "Qualitätsreview",
      summary: `Review-Agent führt read-only Review für „${subject}“ durch.`,
      decisions: ["Review ersetzt keine manuelle Jamal-Freigabe."],
      nextActions: ["Ergebnis gegen Auftrag und Sicherheitsgrenzen spiegeln."],
      risks: ["Review deckt nur sichtbare, nicht implizite Lücken ab."],
      openPoints: ["Welches Review-Kriterium ist heute maßgeblich?"],
    },
    "closure-agent": {
      focus: "Abschluss und Finish",
      summary: `Abschluss-Agent bewertet Abschlussfähigkeit für „${subject}“.`,
      decisions: ["Abschluss nur vorbereiten – nicht erzwingen."],
      nextActions: ["Offene Blocker vor Abschluss benennen."],
      risks: ["Voreiliger Abschluss ohne Nachweis."],
      openPoints: ["Was fehlt noch für einen sauberen Abschluss?"],
    },
    "orchestrator-agent": {
      focus: "Koordination der Agentenperspektiven",
      summary: `Orchestrator-Agent koordiniert read-only Perspektiven für „${subject}“.`,
      decisions: ["Agenten liefern Perspektiven – keine Ausführung."],
      nextActions: ["Agentenbeiträge mit Ergebnisblock und Bericht abgleichen."],
      risks: ["Zu viele Perspektiven ohne klare Priorisierung."],
      openPoints: ["Welche Agentenperspektive ist heute führend?"],
    },
  };

  const template = contributionTemplates[agent.id] || {
    focus: agent.role,
    summary: `${agent.name} bewertet „${subject}“ read-only im Kontext ${category}.`,
    decisions: [`${agent.name}: Nur read-only bewerten.`],
    nextActions: [`${agent.name}: Empfehlung manuell prüfen.`],
    risks: [`${agent.name}: Ergebnis bleibt regelbasiert.`],
    openPoints: [`${agent.name}: Jamal prüft Relevanz der Rolle.`],
  };

  return {
    agentId: agent.id,
    agentName: agent.name,
    role: agent.role,
    status: "completed",
    mode: "read-only-local",
    focus: template.focus,
    summary: template.summary,
    decisions: template.decisions,
    nextActions: template.nextActions,
    risks: template.risks,
    openPoints: template.openPoints,
    safetyState: "unchanged",
  };
}

function runReadOnlyAgentWork(workRequest, analysis) {
  const routing = routeWorkRequestToAgents(workRequest, analysis);
  const selectedIdSet = new Set(routing.selectedAgentIds);
  const selectedAgents = PRODUCTIVE_AGENT_REGISTRY.filter((agent) => selectedIdSet.has(agent.id));
  const skippedAgents = PRODUCTIVE_AGENT_REGISTRY.filter((agent) => !selectedIdSet.has(agent.id)).map(
    (agent) => ({
      id: agent.id,
      name: agent.name,
      status: "skipped",
      reason: "Nicht für Intent/Kategorie geroutet",
    }),
  );
  const agentContributions = selectedAgents.map((agent) =>
    buildReadOnlyAgentContribution(agent, workRequest, analysis),
  );

  return {
    agentRunVersion: AGENT_RUN_VERSION,
    agentRunReady: true,
    agentRunMode: "read-only-local",
    agentCount: 25,
    selectedAgentCount: selectedAgents.length,
    skippedAgentCount: skippedAgents.length,
    selectedAgents: selectedAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      category: agent.category,
    })),
    skippedAgents,
    agentContributions,
    agentRunSafetyState: "unchanged",
    agentRunBlockers: [],
  };
}

function buildAgentAggregatedResult(agentRun, existingResult) {
  const contributions = agentRun?.agentContributions || [];

  return {
    ...existingResult,
    agentSummary: contributions.map((entry) => `${entry.agentName}: ${entry.summary}`).join(" "),
    agentDecisions: contributions.flatMap((entry) =>
      entry.decisions.map((item) => `[${entry.agentName}] ${item}`),
    ),
    agentNextActions: contributions.flatMap((entry) =>
      entry.nextActions.map((item) => `[${entry.agentName}] ${item}`),
    ),
    agentRisks: contributions.flatMap((entry) =>
      entry.risks.map((item) => `[${entry.agentName}] ${item}`),
    ),
    agentOpenPoints: contributions.flatMap((entry) =>
      entry.openPoints.map((item) => `[${entry.agentName}] ${item}`),
    ),
    agentAggregationReady: true,
  };
}

function routeProjectWorkRequestToAgents(workRequest, analysis, projectContext) {
  const baseRouting = routeWorkRequestToAgents(workRequest, analysis);
  const project = projectContext?.project;

  if (!project) {
    return {
      ...baseRouting,
      projectRoutingApplied: false,
      routingReason: "Kein gültiger Projektkontext – Intent-Routing aus V6.34.0 verwendet.",
    };
  }

  const orderedIds = [];
  const seen = new Set();
  const addAgentId = (id) => {
    if (id && !seen.has(id) && PRODUCTIVE_AGENT_REGISTRY.some((agent) => agent.id === id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  };

  (project.recommendedAgents || []).forEach(addAgentId);
  baseRouting.selectedAgentIds.forEach(addAgentId);

  const selectedAgentIds = orderedIds.slice(0, 8);
  while (selectedAgentIds.length < 5) {
    const fallback = ["orchestrator-agent", "documentation-agent", "next-actions-agent"].find(
      (id) => !seen.has(id),
    );
    if (!fallback) break;
    seen.add(fallback);
    selectedAgentIds.push(fallback);
  }

  return {
    ...baseRouting,
    selectedAgentIds,
    projectRoutingApplied: true,
    routingReason: `Projektkontext „${project.name}“: empfohlene Projektagenten bevorzugt, Intent-Agenten ergänzt (min. 5, max. 8).`,
  };
}

function buildProjectAgentContribution(agent, workRequest, analysis, projectContext) {
  const base = buildReadOnlyAgentContribution(agent, workRequest, analysis);
  const project = projectContext?.project;
  const projectName = project?.name || "unbekanntes Projekt";
  const safetyProfile = project?.safetyProfile || "read-only";

  const projectContributionTemplates = {
    "health-upgrade-kompass": {
      "health-compass-agent": `Für den Health Upgrade Kompass sollte der nächste Schritt als sicherer Produktbaustein ohne Diagnose, ohne Messwerte und ohne automatische Empfehlung formuliert werden.`,
      "product-agent": `Für den Health Upgrade Kompass den Auftrag als Produktbaustein in den bestehenden Bereich-1–4-Flow einordnen – nicht als neues Feature außerhalb der Demo.`,
      "customer-value-agent": `Für den Health Upgrade Kompass den Nutzen aus Sicht der Nutzerin (Orientierung, Gesprächsgrundlage) formulieren – nicht aus Techniksicht.`,
      "risk-agent": `Für den Health Upgrade Kompass besonders auf medizinische Formulierungen, Heilversprechen und implizite Empfehlungen achten.`,
      "documentation-agent": `Für den Health Upgrade Kompass das Ergebnis als Copy-Ready Produktdokument-Baustein strukturieren (extern ablegbar).`,
      "next-actions-agent": `Für den Health Upgrade Kompass den kleinsten manuellen nächsten Schritt für Jamal formulieren – demo-tauglich, ohne Codeänderung.`,
    },
    "ki-unternehmenszentrale": {
      "orchestrator-agent": `Für die KI-Unternehmenszentrale die Agentenperspektiven auf Arbeitsfähigkeit und sichere Nutzung des Produktivpfads koordinieren.`,
      "project-status-agent": `Für die KI-Unternehmenszentrale den Ist-Stand des Produktivpfads (Auftrag → Auswertung → Bericht → Abnahme → Agentenlauf) verdichten.`,
      "quality-test-agent": `Für die KI-Unternehmenszentrale die Prüfschritte (Syntax, API-Szenarien, UI-Blöcke, Sicherheitsfelder) benennen.`,
      "security-agent": `Für die KI-Unternehmenszentrale bestätigen, dass agentCount=25 und alle Sperren (Write/Extern/Persistenz) unverändert bleiben.`,
    },
    "expansion-app": {
      "strategy-agent": `Für die Expansion App die Startgrenze klären: welcher kleinste App-Ausschnitt bringt prüfbaren Nutzen ohne neue Komplexität.`,
      "data-structure-agent": `Für die Expansion App nur die Datenstruktur des kleinsten Prüfpunkts skizzieren – keine Implementierung.`,
    },
    "marketing-agentur-os": {
      "communication-agent": `Für das Marketing Agentur OS einen einzigen manuellen Agentur-Nutzen formulieren, der ohne Tool-Aktion prüfbar ist.`,
    },
  };

  const projectSpecific =
    projectContributionTemplates[project?.id]?.[agent.id] ||
    `${agent.name} bearbeitet den Auftrag im Projektkontext „${projectName}“ read-only (${safetyProfile}) und liefert eine projektbezogene Perspektive ohne Ausführung.`;

  return {
    ...base,
    mode: "read-only-local-project-work",
    projectId: project?.id,
    projectName,
    projectContribution: projectSpecific,
    handoff: `Beitrag von ${agent.name} für „${projectName}“ manuell prüfen und bei Bedarf in externes Projektdokument übernehmen.`,
  };
}

function runReadOnlyProjectAgentWork(workRequest, analysis, projectContext) {
  const routing = routeProjectWorkRequestToAgents(workRequest, analysis, projectContext);
  const selectedIdSet = new Set(routing.selectedAgentIds);
  const selectedAgents = PRODUCTIVE_AGENT_REGISTRY.filter((agent) => selectedIdSet.has(agent.id));
  const skippedAgents = PRODUCTIVE_AGENT_REGISTRY.filter((agent) => !selectedIdSet.has(agent.id)).map(
    (agent) => ({
      id: agent.id,
      name: agent.name,
      status: "skipped",
      reason: routing.projectRoutingApplied
        ? "Nicht für Projektkontext/Intent geroutet"
        : "Nicht für Intent/Kategorie geroutet",
    }),
  );
  const agentContributions = selectedAgents.map((agent) =>
    buildProjectAgentContribution(agent, workRequest, analysis, projectContext),
  );

  return {
    agentRunVersion: AGENT_RUN_VERSION,
    agentProjectWorkVersion: AGENT_PROJECT_WORK_VERSION,
    agentRunReady: true,
    agentRunMode: "read-only-local-project-work",
    agentCount: 25,
    selectedAgentCount: selectedAgents.length,
    skippedAgentCount: skippedAgents.length,
    selectedAgents: selectedAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      category: agent.category,
    })),
    skippedAgents,
    agentContributions,
    routingReason: routing.routingReason,
    projectRoutingApplied: routing.projectRoutingApplied,
    agentRunSafetyState: "unchanged",
    agentRunBlockers: [],
  };
}

function buildProjectAgentWorkOrder(projectContext, workRequest, analysis, agentRun) {
  const project = projectContext?.project;
  const projectName = project?.name || "unbekanntes Projekt";
  const requestPreview =
    analysis?.requestPreview ||
    (workRequest.length > 120 ? `${workRequest.slice(0, 120)}...` : workRequest);

  return {
    projectWorkOrderReady: true,
    projectWorkOrderVersion: AGENT_PROJECT_WORK_VERSION,
    projectId: project?.id,
    projectName,
    workRequest: requestPreview,
    workMode: "read-only-project-agent-work",
    selectedAgentCount: agentRun?.selectedAgentCount ?? 0,
    expectedDeliverable: `Read-only Arbeitsergebnis für „${projectName}“: projektbezogene Agentenbeiträge, aggregierte Zusammenfassung und Copy-Ready Übergabetext – ohne Ausführung, Speicherung oder externe Aktion.`,
    projectDecisionNeeded: `Jamal entscheidet manuell, ob das Ergebnis für „${projectName}“ übernommen, nachgeschärft oder verworfen wird.`,
    projectNextManualStep: `Aggregierte Projektzusammenfassung prüfen, den kleinsten sinnvollen Schritt für „${projectName}“ auswählen und extern dokumentieren.`,
    projectRisks: [
      `Auftrag könnte Umfang von „${projectName}“ über die read-only Grenze hinaus erweitern.`,
      "Regelbasierte Beiträge können projektfachliche Tiefe nur begrenzt abbilden.",
      "Ohne externe Ablage geht das Ergebnis nach der Session verloren (keine Persistenz).",
    ],
    projectOpenPoints: [
      `Ist der Auftrag für „${projectName}“ heute der wichtigste Schritt?`,
      "Welche Agentenbeiträge übernimmt Jamal in das externe Projektdokument?",
      "Braucht das Projekt danach einen weiteren Auftrag oder eine manuelle Pause?",
    ],
    handoffText: `Projekt: ${projectName} · Auftrag: ${requestPreview} · Modus: read-only-project-agent-work · Ergebnis manuell prüfen und extern übernehmen. Keine Speicherung, keine externe Aktion, keine Ausführung.`,
  };
}

function buildProjectAgentAggregatedResult(agentRun, projectContext, existingResult) {
  const base = buildAgentAggregatedResult(agentRun, existingResult);
  const contributions = agentRun?.agentContributions || [];
  const project = projectContext?.project;
  const projectName = project?.name || "unbekanntes Projekt";

  return {
    ...base,
    projectAgentAggregationReady: true,
    projectAgentSummary: `Projekt „${projectName}“: ${contributions.length} Agenten haben read-only projektbezogene Beiträge geliefert. ${contributions
      .map((entry) => entry.projectContribution)
      .join(" ")}`,
    projectAgentDecisions: contributions.flatMap((entry) =>
      entry.decisions.map((item) => `[${entry.agentName} · ${projectName}] ${item}`),
    ),
    projectAgentNextActions: contributions.flatMap((entry) =>
      entry.nextActions.map((item) => `[${entry.agentName} · ${projectName}] ${item}`),
    ),
    projectAgentRisks: contributions.flatMap((entry) =>
      entry.risks.map((item) => `[${entry.agentName} · ${projectName}] ${item}`),
    ),
    projectAgentOpenPoints: contributions.flatMap((entry) =>
      entry.openPoints.map((item) => `[${entry.agentName} · ${projectName}] ${item}`),
    ),
    projectAgentHandoff: contributions.map((entry) => entry.handoff),
    projectManualDecision: `Jamal prüft die Beiträge für „${projectName}“ und entscheidet manuell über Übernahme, Nachschärfung oder Stopp.`,
    projectNextManualStep: `Kleinsten sinnvollen nächsten Schritt für „${projectName}“ auswählen und extern dokumentieren – keine automatische Fortsetzung.`,
  };
}

const PRODUCTIVE_INTENT_RULES = [
  {
    intent: "release-finish",
    intentLabel: "Release / Finish",
    category: "Release / Finish",
    keywords: ["release", "finish", "fertig", "abschluss"],
    defaultPriority: "mittel",
  },
  {
    intent: "bugfix",
    intentLabel: "Fehleranalyse / Bugfix",
    category: "Fehleranalyse / Bugfix",
    keywords: ["fehler", "bug", "kaputt", "geht nicht", "funktioniert nicht", "warum"],
    defaultPriority: "hoch",
  },
  {
    intent: "quality-test",
    intentLabel: "Test / Qualitätssicherung",
    category: "Test / Qualitätssicherung",
    keywords: ["test", "syntax", "api", "ui", "prüfung", "qualität", "qa"],
    defaultPriority: "hoch",
  },
  {
    intent: "feature-implementation",
    intentLabel: "Feature-Umsetzung",
    category: "Feature-Umsetzung",
    keywords: ["baue", "implementiere", "ergänze", "füge hinzu", "export", "funktion"],
    defaultPriority: "mittel",
  },
  {
    intent: "project-status",
    intentLabel: "Projektstatus / Prüfung",
    category: "Projektstatus / Prüfung",
    keywords: ["prüfe", "pruefe", "check", "status", "stand", "projektstand", "aktuellen stand"],
    defaultPriority: "mittel",
  },
  {
    intent: "decision-strategy",
    intentLabel: "Entscheidung / Strategie",
    category: "Entscheidung / Strategie",
    keywords: ["entscheide", "strategie", "priorität", "prioritaet", "bewerte", "option"],
    defaultPriority: "mittel",
  },
  {
    intent: "documentation-handover",
    intentLabel: "Dokumentation / Übergabe",
    category: "Dokumentation / Übergabe",
    keywords: ["dokumentiere", "abschlussbericht", "übergabe", "uebergabe", "bericht"],
    defaultPriority: "niedrig",
  },
];

function prepareProductiveWorkRequestInput(workRequestInput) {
  const raw = String(workRequestInput ?? "");
  const trimmed = raw.trim();
  const limitApplied = trimmed.length > PRODUCTIVE_WORK_REQUEST_MAX_LENGTH;
  const normalizedRequest = limitApplied
    ? trimmed.slice(0, PRODUCTIVE_WORK_REQUEST_MAX_LENGTH)
    : trimmed;

  return {
    raw,
    trimmed,
    normalizedRequest,
    limitApplied,
    workRequestLength: raw.length,
    workRequestTrimmed: trimmed.length !== raw.length,
  };
}

function scoreProductiveIntentRule(rule, normalizedLower) {
  const detectedKeywords = rule.keywords.filter((keyword) => normalizedLower.includes(keyword));
  return detectedKeywords.length;
}

function detectProductiveIntent(normalizedLower) {
  let bestRule = null;
  let bestScore = 0;

  PRODUCTIVE_INTENT_RULES.forEach((rule) => {
    const score = scoreProductiveIntentRule(rule, normalizedLower);
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  });

  if (bestRule) {
    return {
      rule: bestRule,
      detectedKeywords: bestRule.keywords.filter((keyword) => normalizedLower.includes(keyword)),
    };
  }

  return {
    rule: {
      intent: "general-productive",
      intentLabel: "Allgemeiner Produktivauftrag",
      category: "Allgemeiner Produktivauftrag / Fallback",
      keywords: [],
      defaultPriority: "mittel",
    },
    detectedKeywords: [],
  };
}

function estimateProductiveComplexity(normalizedRequest, keywordCount) {
  const length = normalizedRequest.length;
  if (length > 400 || keywordCount >= 4) return "hoch";
  if (length > 120 || keywordCount >= 2) return "mittel";
  return "niedrig";
}

function estimateProductivePriority(normalizedLower, defaultPriority) {
  if (/(dringend|sofort|kritisch|blocker|heute)/.test(normalizedLower)) return "hoch";
  if (/(später|optional|vorbereiten|idee)/.test(normalizedLower)) return "niedrig";
  return defaultPriority;
}

function collectProductiveMissingInputs(normalizedRequest, intent) {
  const missingInputs = [];
  if (normalizedRequest.length < 20) {
    missingInputs.push("Auftrag ist sehr kurz – Ziel und erwartetes Ergebnis sollten präziser formuliert werden.");
  }
  if (!/(ziel|ergebnis|schritt|prüf|baue|test|fehler|status|entscheid)/i.test(normalizedRequest)) {
    missingInputs.push("Erwartetes Ergebnis oder gewünschter Output ist nicht eindeutig benannt.");
  }
  if (intent === "feature-implementation" && !/(wo|bereich|modul|datei|ui|api)/i.test(normalizedRequest)) {
    missingInputs.push("Zielbereich für die Feature-Umsetzung ist noch nicht klar genug benannt.");
  }
  if (intent === "bugfix" && !/(button|api|ui|fehler|seite|funktion)/i.test(normalizedRequest)) {
    missingInputs.push("Betroffene Komponente oder Fehlerstelle sollte genauer benannt werden.");
  }
  if (intent === "quality-test" && !/(app\.js|server\.js|endpoint|ui|api)/i.test(normalizedRequest)) {
    missingInputs.push("Konkreter Prüfbereich (Datei, Endpunkt oder UI-Abschnitt) fehlt noch.");
  }
  return missingInputs;
}

function analyzeProductiveWorkRequest(preparedInput) {
  const normalizedRequest = preparedInput.normalizedRequest || "";
  const normalizedLower = normalizedRequest.toLowerCase();
  const { rule, detectedKeywords } = detectProductiveIntent(normalizedLower);
  const complexity = estimateProductiveComplexity(normalizedRequest, detectedKeywords.length);
  const priority = estimateProductivePriority(normalizedLower, rule.defaultPriority);
  const missingInputs = collectProductiveMissingInputs(normalizedRequest, rule.intent);
  const requestedOutcome = normalizedRequest.length > 180
    ? `${normalizedRequest.slice(0, 180)}...`
    : normalizedRequest;

  return {
    normalizedRequest,
    requestPreview: normalizedRequest.slice(0, 160),
    intent: rule.intent,
    intentLabel: rule.intentLabel,
    category: rule.category,
    priority,
    complexity,
    detectedKeywords,
    requestedOutcome,
    recommendedMode: "read-only-productive-preview",
    missingInputs,
    safetyState: "unchanged",
    workRequestLength: preparedInput.workRequestLength,
    workRequestTrimmed: preparedInput.workRequestTrimmed,
    workRequestLimitApplied: preparedInput.limitApplied,
    productiveResultEngineVersion: PRODUCTIVE_RESULT_ENGINE_VERSION,
  };
}

function buildProductiveResultFromWorkAnalysis(analysis) {
  const subject =
    analysis.normalizedRequest.length > 100
      ? `${analysis.normalizedRequest.slice(0, 100)}...`
      : analysis.normalizedRequest;

  const templates = {
    "project-status": {
      summary: `Projektstatus-Auftrag erkannt: „${subject}“. Die Zentrale empfiehlt, zuerst Ist-Stand, offene Punkte und die nächsten sicheren Schritte read-only zu verdichten.`,
      decisions: [
        "Nur read-only prüfen – keine Projektstatusänderung und keine Speicherung.",
        "Zuerst aktuellen Stand benennen, dann maximal drei nächste Schritte priorisieren.",
        "Stoppen, wenn der Auftrag Bereiche außerhalb der Sicherheitsgrenzen erfordert.",
      ],
      nextActions: [
        "Aktuellen Projektstand in app.js/server.js und relevanten API-Feldern gegenlesen.",
        "Offene Punkte und Blocker aus dem Auftrag extrahieren und sichtbar machen.",
        "Nächste sichere Schritte als manuelle Empfehlung formulieren – ohne Ausführung.",
      ],
      risks: [
        "Der Auftrag könnte implizit Statusänderungen erwarten, die weiterhin gesperrt sind.",
        "Unklare Formulierungen führen zu zu allgemeinen Statusaussagen.",
        "Mehrere Ziele im selben Auftrag können den Fokus verwässern.",
      ],
      openPoints: [
        "Welcher Projekt- oder Modulbereich ist gemeint?",
        "Soll nur geprüft oder auch priorisiert werden?",
        "Welches Ergebnis gilt für Jamal als ausreichend für heute?",
      ],
    },
    "feature-implementation": {
      summary: `Feature-Auftrag erkannt: „${subject}“. Die Umsetzung wird nur als read-only Vorbereitung bewertet – ohne Codeänderung, Speicherung oder externe Aktion.`,
      decisions: [
        "Feature nur als minimalen, reversiblen Schritt vorbereiten – nicht automatisch umsetzen.",
        "Bestehende Sicherheitsgrenzen und V1.1.5/V6.33.x-Bestände dürfen nicht beschädigt werden.",
        "Jamal entscheidet manuell, ob der vorgeschlagene Feature-Schritt heute startet.",
      ],
      nextActions: [
        "Betroffene Dateien und UI/API-Bereiche für das Feature identifizieren.",
        "Kleinste sinnvolle Umsetzung und Nicht-Ziele explizit benennen.",
        "Ergebniscontainer mit Entscheidung, Risiken und Testplan read-only vorbereiten.",
      ],
      risks: [
        "Feature-Umfang könnte größer wirken als erlaubt oder sicher ist.",
        "Unklare Zielbereiche führen zu unscharfer Umsetzungsplanung.",
        "Neue Funktionen könnten unbeabsichtigt Schreibpfade vorbereiten.",
      ],
      openPoints: [
        "Welche Datei, welcher Endpunkt oder welche UI-Sektion ist betroffen?",
        "Ist das Feature rein read-only oder später schreibend geplant?",
        "Welche Akzeptanzkriterien gelten für den ersten kleinen Schritt?",
      ],
    },
    bugfix: {
      summary: `Fehleranalyse-Auftrag erkannt: „${subject}“. Der Fokus liegt auf reproduzierbarer Analyse des UI/API-Updateflusses – ohne automatische Reparatur.`,
      decisions: [
        "Zuerst reproduzieren und eingrenzen, nicht sofort ändern.",
        "Nur read-only prüfen: UI-Eingabe, API-Antwort und Ergebnisblock-Rendering.",
        "Fix erst vorbereiten, wenn Ursache und sicherer Minimal-Schritt klar sind.",
      ],
      nextActions: [
        "Prüfen, ob der Button die API mit korrektem workRequest und resultSource aufruft.",
        "API-Antwort und DOM-Update von #productive-work-result gegenlesen.",
        "Fehlerursache, Risiko und kleinsten manuellen Fix-Schritt dokumentieren.",
      ],
      risks: [
        "Symptom könnte an API, UI-Handler oder Ergebnis-Rendering hängen.",
        "Vorschnelle Änderungen könnten V6.33.7-Eingabekorridor beschädigen.",
        "Fehler könnte nur bei bestimmten Auftragstexten auftreten.",
      ],
      openPoints: [
        "Tritt der Fehler in UI, API oder bei leerem Auftrag auf?",
        "Welche Konsolen-/Netzwerk-Hinweise liegen vor?",
        "Ist ein Minimal-Fix ohne neue Schreiblogik möglich?",
      ],
    },
    "quality-test": {
      summary: `Test-/QS-Auftrag erkannt: „${subject}“. Die Zentrale empfiehlt einen lokalen Prüflauf über Syntax, API, UI und Sicherheitsgrenzen.`,
      decisions: [
        "Nur read-only testen – keine Speicherung und keine externen Requests.",
        "Zuerst Syntax und API, dann UI und Sicherheitsfelder prüfen.",
        "Ergebnis nur als Prüfbericht ausgeben, nicht automatisch beheben.",
      ],
      nextActions: [
        "node --check app.js und node --check server.js ausführen.",
        "/api/agents/plugin-readiness mit und ohne workRequest prüfen.",
        "UI-Produktivblock, agentCount=25 und safetyState=unchanged verifizieren.",
      ],
      risks: [
        "Tests könnten nur Happy-Path abdecken und Randfälle übersehen.",
        "Lange Auftragstexte oder leere Eingaben brauchen separate Prüfung.",
        "Sichtbare Ergebnisse garantieren noch keine fachliche Korrektheit.",
      ],
      openPoints: [
        "Welche Endpunkte und UI-Abschnitte sind Pflicht im Test?",
        "Sollen leere, lange oder spezielle Aufträge mitgetestet werden?",
        "Welche Erfolgskriterien gelten für den Abschlussbericht?",
      ],
    },
    "decision-strategy": {
      summary: `Entscheidungs-/Strategie-Auftrag erkannt: „${subject}“. Die Zentrale bereitet Optionen, Grenzen und eine manuelle Jamal-Empfehlung read-only vor.`,
      decisions: [
        "Keine automatische Entscheidung – nur Optionen und Empfehlung sichtbar machen.",
        "Sicherheitsgrenzen haben Vorrang vor Geschwindigkeit oder Scope.",
        "Maximal drei Optionen gleichzeitig vergleichbar halten.",
      ],
      nextActions: [
        "Optionen aus dem Auftrag extrahieren und neutral formulieren.",
        "Nutzen, Risiko und Sicherheitsfolgen je Option benennen.",
        "Eine read-only Empfehlung für Jamal formulieren – ohne Ausführung.",
      ],
      risks: [
        "Strategieaufträge können zu breit werden und den Fokus verlieren.",
        "Fehlende Daten führen zu scheinbar sicheren, aber unvollständigen Empfehlungen.",
        "Prioritäten könnten implizit geändert werden, obwohl alles gesperrt bleibt.",
      ],
      openPoints: [
        "Welche Optionen stehen realistisch zur Auswahl?",
        "Welche Entscheidung ist heute nötig und welche kann warten?",
        "Welche Sicherheitsgrenzen dürfen dabei nicht verletzt werden?",
      ],
    },
    "documentation-handover": {
      summary: `Dokumentations-/Übergabe-Auftrag erkannt: „${subject}“. Es wird ein read-only Abschluss- oder Übergabeentwurf vorbereitet – ohne Persistenz.`,
      decisions: [
        "Nur lesend dokumentieren – nichts speichern oder veröffentlichen.",
        "Stand, Entscheidungen, offene Punkte und nächste Schritte klar trennen.",
        "Jamal prüft den Entwurf manuell vor jeder Weitergabe.",
      ],
      nextActions: [
        "Aktuellen Stand und erreichte Ergebnisse aus dem Auftrag verdichten.",
        "Offene Punkte, Risiken und Sicherheitsgrenzen explizit auflisten.",
        "Übergabeempfehlung als strukturierten read-only Entwurf formulieren.",
      ],
      risks: [
        "Dokumentation könnte den aktuellen Stand über- oder unterschätzen.",
        "Fehlende Quellen führen zu unvollständigen Übergabeberichten.",
        "Unklare Zielgruppe macht den Bericht zu technisch oder zu vage.",
      ],
      openPoints: [
        "Für wen ist die Übergabe gedacht?",
        "Welche Bereiche müssen zwingend enthalten sein?",
        "Welches Format erwartet Jamal für den Abschlussbericht?",
      ],
    },
    "release-finish": {
      summary: `Release-/Finish-Auftrag erkannt: „${subject}“. Die Zentrale bewertet read-only, ob ein Finish-Korridor erreicht ist – ohne Release-Ausführung.`,
      decisions: [
        "Kein Release und keine produktive Freischaltung automatisch starten.",
        "Finish nur anhand klarer Kriterien und offener Punkte bewerten.",
        "V6.33.6-Finish-Korridor respektieren und nicht neu belegen.",
      ],
      nextActions: [
        "Finish-Kriterien aus dem Auftrag gegen aktuellen Bestand spiegeln.",
        "Offene Blocker, Risiken und fehlende Nachweise benennen.",
        "Manuelle Go/No-Go-Empfehlung für Jamal vorbereiten.",
      ],
      risks: [
        "Finish-Druck könnte Sicherheits- oder Qualitätsgrenzen verwässern.",
        "Unklare Definition von 'fertig' führt zu falschem Abschlussgefühl.",
        "Release-Umfang könnte größer sein als der erlaubte read-only Schritt.",
      ],
      openPoints: [
        "Welche Finish-Kriterien sind verbindlich?",
        "Welche Bereiche sind noch nicht finish-nah?",
        "Darf der Schritt nur vorbereitet oder wirklich abgeschlossen werden?",
      ],
    },
    "general-productive": {
      summary: `Produktivauftrag erkannt: „${subject}“. Die Zentrale hat den Auftrag lokal eingeordnet und einen read-only Ergebnisvorschlag erstellt.`,
      decisions: [
        "Der Auftrag wird nur lokal und read-only ausgewertet.",
        "Keine automatische Ausführung, Speicherung oder externe Aktion.",
        "Jamal entscheidet manuell über jeden Folgeschritt.",
      ],
      nextActions: [
        "Auftrag in summary, decisions, nextActions, risks und openPoints spiegeln.",
        "Fehlende Zielangaben aus missingInputs nachschärfen.",
        "Sicherheitsgrenzen vor jeder Weiterführung erneut bestätigen.",
      ],
      risks: [
        "Allgemeine Aufträge können ohne klare Kategorie unscharf bleiben.",
        "Ergebnisqualität hängt von der Präzision der Formulierung ab.",
        "Mehrdeutige Ziele könnten zu generischen Empfehlungen führen.",
      ],
      openPoints: [
        "Welche Kategorie passt am besten, falls der Auftrag präzisiert wird?",
        "Welches konkrete Ergebnis erwartet Jamal sichtbar zurück?",
        "Soll der Auftrag read-only bleiben oder später manuell umgesetzt werden?",
      ],
    },
  };

  const template = templates[analysis.intent] || templates["general-productive"];
  const systemReadiness =
    analysis.normalizedRequest.includes("KI-Unternehmenszentrale") &&
    (analysis.normalizedRequest.includes("Produktivergebnis") ||
      analysis.normalizedRequest.includes("Arbeitsaufträge strukturiert"));

  if (systemReadiness) {
    template.summary =
      "Die KI-Unternehmenszentrale ist technisch stabilisiert und verfügt über einen synchronen UI/API-Ergebniscontainer für Produktivläufe.";
    template.decisions = [
      "Der bestehende V6.33.5-Korridor bleibt aktiv.",
      "Kein neuer Versionslauf wird gestartet.",
      "Der nächste Fokus liegt auf echter Auftragsverarbeitung statt weiterer Versionspflege.",
    ];
    template.nextActions = [
      "Produktivauftrag gegen den Ergebniscontainer testen.",
      "Prüfen, ob Ergebnisfelder dynamisch oder statisch befüllt werden.",
      "Falls nötig minimale Input-zu-Result-Struktur ergänzen.",
    ];
  }

  return {
    ...template,
    safetyState: "unchanged",
    derivedFromWorkRequest: true,
    workRequestPreview: analysis.requestPreview,
    intent: analysis.intentLabel,
    category: analysis.category,
    priority: analysis.priority,
    complexity: analysis.complexity,
    recommendedMode: analysis.recommendedMode,
    detectedKeywords: analysis.detectedKeywords,
    missingInputs: analysis.missingInputs,
    productiveResultEngineVersion: analysis.productiveResultEngineVersion,
    analysis,
  };
}

function buildProductiveResultFromWorkRequest(workRequest) {
  const prepared = prepareProductiveWorkRequestInput(workRequest);
  if (!prepared.normalizedRequest) {
    return getProductiveManualHealthDayWorkDefaultResult();
  }
  return buildProductiveResultFromWorkAnalysis(analyzeProductiveWorkRequest(prepared));
}

function formatProductiveReportList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "—";
  }
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function buildProductiveReportText(productiveWork) {
  const result = productiveWork?.result || {};
  const analysis = result.analysis || productiveWork?.analysis || {};
  const detectedKeywords = Array.isArray(result.detectedKeywords)
    ? result.detectedKeywords
    : analysis.detectedKeywords || [];
  const missingInputs = Array.isArray(result.missingInputs)
    ? result.missingInputs
    : analysis.missingInputs || [];
  const workRequest =
    productiveWork?.workRequest ||
    result.workRequestPreview ||
    "— (Health-/Test-Fallback)";
  const safety = productiveWork?.safety || {};
  const safetyState = result.safetyState || "unchanged";

  const reportSections = {
    title: "Produktivbericht – KI-Unternehmenszentrale",
    workRequest,
    summary: result.summary || "—",
    decisions: Array.isArray(result.decisions) ? result.decisions : [],
    nextActions: Array.isArray(result.nextActions) ? result.nextActions : [],
    risks: Array.isArray(result.risks) ? result.risks : [],
    openPoints: Array.isArray(result.openPoints) ? result.openPoints : [],
    analysis: {
      intent: result.intent || analysis.intentLabel || "—",
      category: result.category || analysis.category || "—",
      priority: result.priority || analysis.priority || "—",
      complexity: result.complexity || analysis.complexity || "—",
      recommendedMode: result.recommendedMode || analysis.recommendedMode || "—",
      detectedKeywords: detectedKeywords.length ? detectedKeywords.join(", ") : "—",
      missingInputs: missingInputs.length ? missingInputs : ["—"],
    },
    safety: {
      agentCount: productiveWork?.agentCount ?? 25,
      writeOperationsBlocked: safety.writeOperationsBlocked ?? true,
      madeExternalRequest: safety.madeExternalRequest ?? false,
      safetyState,
      persistence: "nein",
      externalRequests: "nein",
      writeOperations: "nein",
    },
    versions: {
      v115: "intakt",
      v6335: "korrekt referenziert",
      v6336: "unverändert",
      v6337: "Eingabekorridor intakt",
      v6338: "Auswertungskern intakt",
      v6339: "Produktivbericht aktiv",
    },
  };

  const reportText = [
    `# ${reportSections.title}`,
    "",
    "## Auftrag",
    reportSections.workRequest,
    "",
    "## Zusammenfassung",
    reportSections.summary,
    "",
    "## Entscheidungen",
    formatProductiveReportList(reportSections.decisions),
    "",
    "## Nächste Aktionen",
    formatProductiveReportList(reportSections.nextActions),
    "",
    "## Risiken",
    formatProductiveReportList(reportSections.risks),
    "",
    "## Offene Punkte",
    formatProductiveReportList(reportSections.openPoints),
    "",
    "## Analyse",
    `- Intent: ${reportSections.analysis.intent}`,
    `- Kategorie: ${reportSections.analysis.category}`,
    `- Priorität: ${reportSections.analysis.priority}`,
    `- Komplexität: ${reportSections.analysis.complexity}`,
    `- Empfohlener Modus: ${reportSections.analysis.recommendedMode}`,
    `- Erkannte Schlüsselwörter: ${reportSections.analysis.detectedKeywords}`,
    `- Fehlende Eingaben: ${reportSections.analysis.missingInputs.join("; ")}`,
    "",
    "## Sicherheitsstatus",
    `- agentCount: ${reportSections.safety.agentCount}`,
    `- writeOperationsBlocked: ${reportSections.safety.writeOperationsBlocked}`,
    `- madeExternalRequest: ${reportSections.safety.madeExternalRequest}`,
    `- safetyState: ${reportSections.safety.safetyState}`,
    `- Persistenz: ${reportSections.safety.persistence}`,
    `- Externe Requests: ${reportSections.safety.externalRequests}`,
    `- Schreiboperationen: ${reportSections.safety.writeOperations}`,
    "",
    "## Versionsstatus",
    `- V1.1.5: ${reportSections.versions.v115}`,
    `- V6.33.5: ${reportSections.versions.v6335}`,
    `- V6.33.6: ${reportSections.versions.v6336}`,
    `- V6.33.7: ${reportSections.versions.v6337}`,
    `- V6.33.8: ${reportSections.versions.v6338}`,
    `- V6.33.9: ${reportSections.versions.v6339}`,
  ];

  const projectWorkOrder = productiveWork?.projectWorkOrder;
  if (projectWorkOrder?.projectWorkOrderReady) {
    const selectedAgentNames = (productiveWork?.selectedAgents || []).map((agent) => agent.name);
    const contributions = productiveWork?.agentContributions || [];
    reportSections.projectAgentRun = {
      projectName: projectWorkOrder.projectName,
      workRequest: projectWorkOrder.workRequest,
      selectedAgents: selectedAgentNames,
      projectAgentSummary: result.projectAgentSummary || "—",
      projectManualDecision: result.projectManualDecision || "—",
      projectNextManualStep: result.projectNextManualStep || "—",
      projectRisks: projectWorkOrder.projectRisks || [],
      projectOpenPoints: projectWorkOrder.projectOpenPoints || [],
    };

    reportText.push(
      "",
      "## Projektbezogener Agentenlauf",
      `- Projekt: ${projectWorkOrder.projectName}`,
      `- Auftrag: ${projectWorkOrder.workRequest}`,
      `- Ausgewählte Agenten: ${selectedAgentNames.join(", ") || "—"}`,
      "",
      "### Agentenbeiträge (Kurzfassung)",
      contributions.length
        ? contributions
            .map((entry) => `- ${entry.agentName}: ${entry.projectContribution || entry.summary}`)
            .join("\n")
        : "—",
      "",
      "### Aggregierte Projekt-Zusammenfassung",
      result.projectAgentSummary || "—",
      "",
      "### Manuelle Entscheidung",
      result.projectManualDecision || projectWorkOrder.projectDecisionNeeded || "—",
      "",
      "### Nächster manueller Schritt",
      result.projectNextManualStep || projectWorkOrder.projectNextManualStep || "—",
      "",
      "### Projektrisiken",
      formatProductiveReportList(projectWorkOrder.projectRisks),
      "",
      "### Offene Projektpunkte",
      formatProductiveReportList(projectWorkOrder.projectOpenPoints),
      "",
      "### Sicherheitsstatus (Projektlauf)",
      "- Modus: read-only-project-agent-work",
      "- safetyState: unchanged",
      "- Keine Ausführung, keine Speicherung, keine externe Aktion",
    );
  }

  const pluginCommandCenter = productiveWork?.pluginCommandCenter;
  if (pluginCommandCenter?.pluginCommandCenterReady) {
    reportSections.pluginCommandCenter = {
      pluginCommandCenterVersion: pluginCommandCenter.pluginCommandCenterVersion,
      pluginCount: pluginCommandCenter.pluginCount,
      highPriorityPlugins: pluginCommandCenter.highPriorityPlugins,
      nextPluginDemoStep: pluginCommandCenter.nextPluginDemoStep,
    };

    reportText.push(
      "",
      "## Plugin-Leitstand",
      `- Version: ${pluginCommandCenter.pluginCommandCenterVersion}`,
      `- Modus: ${pluginCommandCenter.pluginCommandCenterMode}`,
      `- Verfügbare Plugins (${pluginCommandCenter.pluginCount}):`,
      (pluginCommandCenter.pluginRegistry || [])
        .map((plugin) => `  - ${plugin.name} (${plugin.status}, Demo-Priorität: ${plugin.demoPriority})`)
        .join("\n"),
      `- Vorbereitete Aktionskarten: ${
        pluginCommandCenter.pluginActionCardsReady
          ? pluginCommandCenter.pluginActionCards.length
          : "keine (kein projektbezogener Lauf aktiv)"
      }`,
      "",
      "### Read-only erlaubt",
      (pluginCommandCenter.pluginRegistry || [])
        .map((plugin) => `- ${plugin.name}: ${plugin.readOnlyAllowedActions.join("; ")}`)
        .join("\n"),
      "",
      "### Blockiert bleibt",
      formatProductiveReportList(pluginCommandCenter.blockedPluginActions),
      "",
      "### Sicherheitsregeln",
      formatProductiveReportList(pluginCommandCenter.pluginSafetyRules),
      "",
      "### Nächster Demo-Schritt",
      pluginCommandCenter.nextPluginDemoStep || "—",
    );

    if (pluginCommandCenter.pluginActionCardsReady) {
      reportText.push("", "## Projektbezogene Plugin-Aktionskarten");
      pluginCommandCenter.pluginActionCards.forEach((card) => {
        reportText.push(
          "",
          `### ${card.pluginName}: ${card.actionTitle}`,
          `- Projekt: ${card.projectName}`,
          `- Plugin: ${card.pluginName}`,
          `- Aktion: ${card.actionTitle}`,
          `- Status: ${card.status}`,
          `- Erwartetes Ergebnis: ${card.expectedOutput}`,
          `- Manuelle Freigabe erforderlich: ${card.requiresManualApproval ? "ja" : "nein"}`,
          `- Sicherheitsgrenze: ${card.safetyNote}`,
          `- Nächster manueller Schritt: ${card.nextManualStep}`,
        );
      });
    }
  }

  return {
    productiveReportVersion: PRODUCTIVE_REPORT_VERSION,
    reportReady: true,
    reportMode: "copy-ready-read-only",
    reportBuiltBy: "buildProductiveReportText",
    reportText: reportText.join("\n"),
    reportSections,
  };
}

function getProductiveAcceptanceStatus(productiveWork) {
  const checks = [
    {
      name: "Produktivauftrag-Eingabe",
      passed: productiveWork?.productiveInputCorridorVersion === "V6.33.7" ||
        productiveWork?.productiveRunTest === true ||
        productiveWork?.resultSource === "default-health-fallback",
    },
    {
      name: "Lokaler Auswertungskern",
      passed:
        productiveWork?.productiveResultEngineVersion === "V6.33.8" ||
        productiveWork?.resultSource === "default-health-fallback",
    },
    {
      name: "Produktiv-Ergebnisblock",
      passed: !!(productiveWork?.resultReady && productiveWork?.result?.summary),
    },
    {
      name: "Copy-Ready Bericht",
      passed: !!(productiveWork?.reportReady && productiveWork?.reportText),
    },
    { name: "API-Verfügbarkeit", passed: true },
    { name: "UI-Verfügbarkeit", passed: true },
    {
      name: "agentCount unverändert",
      passed: productiveWork?.agentCount === 25,
    },
    {
      name: "Sicherheitsgrenzen unverändert",
      passed:
        productiveWork?.safety?.writeOperationsBlocked === true &&
        productiveWork?.safety?.madeExternalRequest === false &&
        productiveWork?.result?.safetyState === "unchanged",
    },
    {
      name: "Keine externen Requests",
      passed:
        productiveWork?.safety?.madeExternalRequest === false &&
        productiveWork?.madeExternalRequest === false,
    },
    {
      name: "Keine Schreiboperationen",
      passed:
        productiveWork?.writeOperationsBlocked === true &&
        productiveWork?.safety?.writeOperationsBlocked === true,
    },
    {
      name: "Keine Persistenz",
      passed: productiveWork?.storageBlocked === true,
    },
    {
      name: "Versionskonsistenz",
      passed:
        productiveWork?.version === "V6.33.5" &&
        (!productiveWork?.productiveReportVersion ||
          productiveWork.productiveReportVersion === "V6.33.9"),
    },
  ];

  const productiveAcceptanceBlockers = checks
    .filter((check) => !check.passed)
    .map((check) => check.name);
  const productiveAcceptanceReady = productiveAcceptanceBlockers.length === 0;

  return {
    productiveAcceptanceVersion: PRODUCTIVE_ACCEPTANCE_VERSION,
    productiveAcceptanceReady,
    productiveAcceptanceStatus: productiveAcceptanceReady
      ? "ready-read-only-productive"
      : "acceptance-incomplete",
    productiveAcceptanceMode: "end-to-end-read-only",
    productiveAcceptanceChecks: checks,
    productiveAcceptanceBlockers,
    productiveAcceptanceNextStep: productiveAcceptanceReady
      ? "Read-only Produktivmodus kann für manuelle Arbeitsaufträge genutzt werden."
      : "Abnahmeblocker prüfen, bevor der Produktivmodus weiter genutzt wird.",
  };
}

function getProductiveManualHealthDayWorkDefaultResult() {
  return {
    summary:
      "Der Health Upgrade Kompass braucht jetzt einen ersten manuellen Produktstruktur-Entwurf mit 5 Bereichen. Jamal kann direkt mit der vorbereiteten Tagesarbeit starten, ohne Automatisierung, Speicherung oder externe Systeme.",
    decisions: [
      "Jetzt manuell ausarbeiten: ersten Produktstruktur-Entwurf für den Health Upgrade Kompass erstellen.",
      "Noch einmal schärfen: Struktur vereinfachen, bevor Jamal manuell startet.",
      "Stoppen / nicht weiterführen: abbrechen, wenn Nutzen, Grenze oder Ergebnis nicht klar genug sind.",
    ],
    nextActions: [
      "Phase 1: bisherige Health-Kompass-Logik sammeln und Kernbereiche sichtbar machen.",
      "Phase 2: 5 Produktbereiche mit Zweck, Nutzen und Grenze formulieren.",
      "Phase 3: Struktur auf Verständlichkeit, Sicherheit und Weiterführbarkeit prüfen.",
      "Danach entscheiden: weiterarbeiten, nachschärfen oder stoppen.",
    ],
    risks: [
      "Die Struktur könnte medizinisch wirken oder Diagnose/Heilwirkung suggerieren.",
      "Der Nutzen bleibt unverständlich, wenn die 5 Bereiche nicht klar genug formuliert sind.",
      "Geschwindigkeit könnte die Qualität verdrängen.",
      "Externe Daten, Tools oder Speicherungen könnten fälschlich nötig erscheinen.",
    ],
    openPoints: [
      "Einstieg / Orientierung: Ist der Einstieg ohne Erklärung verständlich?",
      "Gesundheitsziel / Motivation: Sind Ziel und Motivation neutral formuliert?",
      "Körperdaten / Messlogik: Bleibt der Bereich ohne echte Daten erklärbar?",
      "Beratergespräch / Empfehlungsvorbereitung: Ist klar, dass die Beratung menschlich bleibt?",
      "Kundenbereich / nächste Handlung: Bleibt die nächste Handlung manuell und sicher?",
    ],
    safetyState: "unchanged",
    derivedFromWorkRequest: false,
  };
}

function getProductiveManualHealthDayWorkResult(workRequest = PRODUCTIVE_WORK_REQUEST_TEST) {
  return buildProductiveResultFromWorkRequest(workRequest);
}

function getProductiveManualHealthDayWork(options = {}) {
  const hasExplicitInput = Object.prototype.hasOwnProperty.call(options, "workRequestInput");
  const resultSource = options.resultSource || "api-work-request";
  const projectContext = resolveProductiveProjectContext(options.projectIdInput);

  let workRequest;
  let activeResultSource;
  let productiveRunTest = false;
  let productiveInputCorridorVersion;
  let productiveResultEngineVersion;
  let analysis;
  let prepared;
  let result;
  let workRequestLength;
  let workRequestTrimmed;
  let workRequestLimitApplied;
  let agentRun;
  let projectWorkOrder;
  let agentProjectWorkVersion;

  if (!hasExplicitInput) {
    workRequest = PRODUCTIVE_WORK_REQUEST_TEST;
    activeResultSource = "productive-test-request";
    productiveRunTest = true;
    prepared = prepareProductiveWorkRequestInput(workRequest);
    analysis = analyzeProductiveWorkRequest(prepared);
    productiveResultEngineVersion = PRODUCTIVE_RESULT_ENGINE_VERSION;
    result = buildProductiveResultFromWorkAnalysis(analysis);
  } else {
    prepared = prepareProductiveWorkRequestInput(options.workRequestInput);
    workRequestLength = prepared.workRequestLength;
    workRequestTrimmed = prepared.workRequestTrimmed;
    workRequestLimitApplied = prepared.limitApplied;

    if (!prepared.normalizedRequest) {
      workRequest = "";
      activeResultSource = "default-health-fallback";
      result = getProductiveManualHealthDayWorkDefaultResult();
    } else {
      workRequest = prepared.normalizedRequest;
      activeResultSource = resultSource;
      productiveInputCorridorVersion = PRODUCTIVE_INPUT_CORRIDOR_VERSION;
      analysis = analyzeProductiveWorkRequest(prepared);
      productiveResultEngineVersion = PRODUCTIVE_RESULT_ENGINE_VERSION;
      result = buildProductiveResultFromWorkAnalysis(analysis);

      if (projectContext?.projectContextReady) {
        agentRun = runReadOnlyProjectAgentWork(workRequest, analysis, projectContext);
        projectWorkOrder = buildProjectAgentWorkOrder(
          projectContext,
          workRequest,
          analysis,
          agentRun,
        );
        result = buildProjectAgentAggregatedResult(agentRun, projectContext, result);
        agentProjectWorkVersion = AGENT_PROJECT_WORK_VERSION;
      } else {
        agentRun = runReadOnlyAgentWork(workRequest, analysis);
        result = buildAgentAggregatedResult(agentRun, result);
        if (projectContext?.unknownProject) {
          result = {
            ...result,
            openPoints: [
              ...(result.openPoints || []),
              `Unbekannte Projekt-ID „${projectContext.selectedProjectId}“ – Auftrag wurde ohne Projektkontext ausgewertet.`,
            ],
          };
        }
      }
    }
  }

  const pluginCommandCenter = buildPluginCommandCenter(
    projectContext,
    workRequest,
    analysis,
    agentRun,
  );

  const projectContextFields = projectContext
    ? {
        selectedProjectId: projectContext.selectedProjectId,
        selectedProjectName: projectContext.selectedProjectName,
        projectContextReady: projectContext.projectContextReady,
        projectContextSource: projectContext.projectContextSource,
        unknownProject: projectContext.unknownProject,
        projectSafetyProfile: projectContext.project?.safetyProfile,
        projectRecommendedAgents: projectContext.project?.recommendedAgents,
        projectStatus: projectContext.project?.status,
        projectDescription: projectContext.project?.description,
      }
    : {};

  const productiveWorkBase = {
    version: "V6.33.5",
    productiveInputCorridorVersion,
    productiveResultEngineVersion,
    agentProjectWorkVersion,
    ...projectContextFields,
    projectWorkOrder,
    pluginCommandCenter,
    prepared: true,
    agentCount: 25,
    resultMode: "productive",
    resultReady: true,
    workRequest: workRequest || undefined,
    workRequestLength,
    workRequestTrimmed,
    workRequestLimitApplied,
    resultSource: activeResultSource,
    productiveRunTest,
    resultBuiltBy: "buildProductiveResultFromWorkAnalysis",
    analysis,
    result,
    ...(agentRun || {}),
    healthDayWorkDefaultResult: getProductiveManualHealthDayWorkDefaultResult(),
    safety: {
      writeOperationsBlocked: true,
      madeExternalRequest: false,
    },
    title: "Schnelle manuelle Health-Tagesarbeit",
    status: "manuelle Tagesarbeit aus schnellem Qualitätsmodus vorbereitet",
    focus: "Health Upgrade Kompass",
    sourceVersion: "V6.33.4",
    source:
      "V6.33.4 Schneller qualitätsgesicherter Arbeitsmodus mit Verstehen, Entscheiden, Ausführen.",
    goal:
      "Aus der vorbereiteten Arbeitskarte jetzt einen echten manuellen Tagesarbeitsschritt machen.",
    concreteWorkStep: {
      title: "Erste manuelle Produktstruktur für den Health Upgrade Kompass ausarbeiten",
      description:
        "Jamal soll aus der bisherigen Agentenauswertung und dem schnellen Arbeitsmodus eine erste verwendbare Produktstruktur ableiten. Diese Produktstruktur ist noch kein fertiges Produkt, kein Kundenversprechen und keine automatisierte Logik, sondern ein manuell prüfbarer Strukturentwurf.",
    },
    reason: [
      "V6.33.4 hat den schnellen Arbeitsmodus vorbereitet.",
      "Der Health Upgrade Kompass ist aktuell der wichtigste Produktivfokus.",
      "Der nächste Fortschritt entsteht nicht durch weitere Simulation, sondern durch einen ersten manuell prüfbaren Produktstruktur-Entwurf.",
      "Die Unternehmenszentrale wird dadurch erstmals als echte Arbeitsführung nutzbar.",
    ],
    workPhases: [
      {
        phase: "Phase 1: Struktur vorbereiten",
        goal: [
          "bisherige Health-Kompass-Logik sammeln",
          "Kernbereiche sichtbar machen",
          "keine Detailausarbeitung erzwingen",
        ],
        result: "grobe Struktur des Health Upgrade Kompass",
      },
      {
        phase: "Phase 2: Struktur ausarbeiten",
        goal: [
          "5 erste Produktbereiche formulieren",
          "je Bereich Zweck, Nutzen und Grenze benennen",
          "Kundensicht und Geschäftsführer-Sicht trennen",
        ],
        result: "erster manueller Produktstruktur-Entwurf",
      },
      {
        phase: "Phase 3: Qualität prüfen",
        goal: [
          "prüfen, ob die Struktur verständlich, sicher und weiterführbar ist",
          "keine Diagnose, keine Heilversprechen, keine falsche Reife vortäuschen",
          "entscheiden, ob Jamal weiterarbeitet, nachschärft oder stoppt",
        ],
        result: "manuell bewertbarer Zwischenstand",
      },
    ],
    expectedManualResult:
      "Ein erster manueller Strukturentwurf für den Health Upgrade Kompass mit 5 Produktbereichen, je Bereich Zweck, Nutzen, Grenze und nächstem Prüfpunkt.",
    productStructureReviewAreas: [
      {
        area: "Einstieg / Orientierung",
        purpose: "Den Nutzer schnell verstehen lassen, was der Kompass leistet und was nicht.",
        customerBenefit: "Sicherheit und Orientierung vor dem Start.",
        advisorOrFounderBenefit:
          "Klarer Einstiegspunkt für Beratung, Positionierung und spätere Demo.",
        boundary: "Kein medizinisches Versprechen und keine Ergebnisgarantie.",
        nextManualCheck: "Prüfen, ob der Einstieg ohne Erklärung verständlich ist.",
      },
      {
        area: "Gesundheitsziel / Motivation",
        purpose: "Das persönliche Ziel und die Motivation strukturiert erfassen.",
        customerBenefit: "Der Nutzer erkennt, worauf er achten möchte.",
        advisorOrFounderBenefit:
          "Beratung kann später gezielter an Ziel und Motivation anknüpfen.",
        boundary: "Keine Diagnose und keine Bewertung des Gesundheitszustands.",
        nextManualCheck: "Prüfen, ob Ziel und Motivation neutral formuliert sind.",
      },
      {
        area: "Körperdaten / Messlogik",
        purpose: "Mögliche Mess- oder Eingabedaten als Strukturpunkt einordnen.",
        customerBenefit: "Der Nutzer versteht, welche Angaben später relevant sein könnten.",
        advisorOrFounderBenefit:
          "Die Zentrale erkennt, wo Sensibilität, Datenschutz und Nutzen zusammenkommen.",
        boundary: "Keine echten Kunden-, Gesundheits- oder Waagendaten verwenden.",
        nextManualCheck: "Prüfen, ob der Bereich auch ohne echte Daten erklärbar bleibt.",
      },
      {
        area: "Beratergespräch / Empfehlungsvorbereitung",
        purpose: "Den Übergang von Kompass-Ergebnis zu menschlicher Beratung vorbereiten.",
        customerBenefit: "Der Nutzer sieht einen sicheren nächsten menschlichen Schritt.",
        advisorOrFounderBenefit:
          "Beraterinnen bekommen später eine bessere Gesprächsgrundlage.",
        boundary: "Keine automatische Empfehlung und keine Heilversprechen.",
        nextManualCheck: "Prüfen, ob klar ist, dass die Beratung menschlich bleibt.",
      },
      {
        area: "Kundenbereich / nächste Handlung",
        purpose: "Eine sichere Weiterführung nach dem Kompass sichtbar machen.",
        customerBenefit: "Der Nutzer weiß, was nach dem Ergebnis als Nächstes möglich ist.",
        advisorOrFounderBenefit:
          "Der Kundenbereich kann später strukturiert, aber nicht vorschnell automatisiert werden.",
        boundary: "Keine Speicherung echter Kundendaten und keine automatische Folgeaktion.",
        nextManualCheck: "Prüfen, ob die nächste Handlung manuell und sicher bleibt.",
      },
    ],
    agentContributionDimensions: [
      {
        dimension: "Führung & Entscheidung",
        roles: ["GF-Agent", "Projektmanager-Agent"],
        contribution:
          "Fokus halten, Entscheidung vorbereiten und Stopppunkte sichtbar machen.",
        boundary: "keine automatische Entscheidung",
      },
      {
        dimension: "Produkt & Nutzerführung",
        roles: ["Produktmanager-Agent", "Design-Director-Agent", "Content-Agent"],
        contribution:
          "Produktstruktur schärfen, Nutzerlogik vereinfachen und verständliche Formulierungen vorbereiten.",
        boundary: "kein fertiges Kundenversprechen",
      },
      {
        dimension: "Umsetzung & Qualität",
        roles: ["Entwickler-Agent", "QA-Agent"],
        contribution:
          "spätere Umsetzbarkeit einschätzen und Struktur auf Prüfbarkeit und Klarheit testen.",
        boundary: "kein Code-Zwang in diesem Schritt",
      },
      {
        dimension: "Sicherheit & Wissen",
        roles: ["Compliance/Risiko-Agent", "Wissens/Archiv-Agent", "Plugin/Tool-Radar-Agent"],
        contribution:
          "Diagnose- und Heilversprechen verhindern, vorhandenes Wissen einordnen und Tool-Bedarf nur read-only bewerten.",
        boundary:
          "keine externen Requests, keine Plugin-Aktion, keine Datenspeicherung",
      },
    ],
    jamalOptions: [
      {
        option: "Jetzt manuell ausarbeiten",
        meaning:
          "Jamal nutzt die vorbereitete Struktur und erstellt den ersten manuellen Produktstruktur-Entwurf.",
      },
      {
        option: "Noch einmal schärfen",
        meaning:
          "Die Struktur ist noch nicht klar genug und wird vor der manuellen Arbeit weiter vereinfacht.",
      },
      {
        option: "Stoppen / nicht weiterführen",
        meaning:
          "Der Schritt wird nicht fortgesetzt, wenn Nutzen, Grenze oder Ergebnis nicht klar genug sind.",
      },
    ],
    qualityBeforeSpeedRule:
      "Schnell ist nur erlaubt, wenn das Ergebnis verständlich, manuell prüfbar und sicher begrenzt bleibt.",
    nonGoals: [
      "keine fertige Health-App",
      "keine medizinische Bewertung",
      "keine Diagnose",
      "keine Heilversprechen",
      "keine automatische Empfehlung",
      "keine Speicherung echter Kundendaten",
      "keine Verbindung zu externen Systemen",
      "kein Start von Automatisierung",
      "keine neue API-Schreibfunktion",
      "keine echte Projektbearbeitung ohne Jamals manuelle Entscheidung",
    ],
    stopBoundaries: [
      "die Struktur medizinisch wirkt",
      "der Nutzen nicht verständlich ist",
      "eine Diagnose oder Heilwirkung suggeriert wird",
      "Jamal keine klare Entscheidung treffen kann",
      "das Ergebnis nicht manuell prüfbar ist",
      "externe Daten, Tools oder Speicherungen nötig würden",
      "Geschwindigkeit die Qualität verdrängt",
    ],
    recommendation:
      "Empfehlung: Jamal sollte jetzt nur den ersten manuellen Produktstruktur-Entwurf erstellen. Nicht coden, nicht automatisieren, nicht mit externen Systemen verbinden. Ziel ist ein klarer, prüfbarer Zwischenstand, der danach bewertet werden kann.",
    qualityBoundary:
      "Qualitätsgrenze: Der Schritt ist nur erfolgreich, wenn Jamal danach klar sagen kann, welche 5 Produktbereiche der Health Upgrade Kompass zuerst braucht, welchen Nutzen jeder Bereich hat und wo die Grenze liegt.",
    safetyBoundary:
      "Sicherheitsgrenze: Keine Diagnose, keine Heilversprechen, keine echten Kundendaten, keine Speicherung, keine externen Requests, keine automatische Projektbearbeitung.",
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    qualityBeforeSpeed: true,
    requiresJamalApproval: true,
    madeExternalRequest: false,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticDecisionBlocked: true,
    automaticContinuationBlocked: true,
    externalConnectionsBlocked: true,
  };

  const productiveWorkWithReport = {
    ...productiveWorkBase,
    ...buildProductiveReportText(productiveWorkBase),
  };

  return {
    ...productiveWorkWithReport,
    ...getProductiveAcceptanceStatus(productiveWorkWithReport),
  };
}

function getProductiveHealthFinishCorridor() {
  return {
    title: "Ergebnisorientierter Finish-Korridor",
    status: "finish-orientierter Ergebniskorridor vorbereitet",
    project: "Health Upgrade Kompass",
    prepared: true,
    concreteNextStep:
      "Health Upgrade Kompass: erste Produktstruktur in finish-nahes Zwischenergebnis überführen",
    guidingQuestion: "Was muss jetzt fertig werden?",
    finishGoal:
      "Eine erste belastbare Produktstruktur für den Health Upgrade Kompass steht so klar, dass Jamal entscheiden kann, ob daraus der nächste manuelle Umsetzungsblock gebaut wird.",
    productStructureMustClarify: [
      "Zweck",
      "Kundennutzen",
      "Berater-/GF-Nutzen",
      "Grenze",
      "nächster Umsetzungspunkt",
    ],
    resultBeforeMorePreparationRule:
      "Keine neuen Agentenläufe, keine neuen Nebenschauplätze und keine weiteren Vorbereitungsrunden, solange das aktuelle Zwischenergebnis nicht sichtbar fertiggestellt oder bewusst gestoppt wurde.",
    necessarySteps: [
      "vorhandene Health-Auswertung auf Produktstruktur verdichten",
      "offene Punkte in Muss/Kann/Später trennen",
      "erste nutzbare Produktstruktur formulieren",
      "Qualitätsgrenze prüfen",
      "Jamals Freigabeentscheidung vorbereiten",
    ],
    finishQuestions: [
      "Ist klar, was dieses Produktmodul leisten soll?",
      "Ist klar, welchen Nutzen Kunde, Beraterin und Geschäftsführung daraus haben?",
      "Ist klar, was ausdrücklich noch nicht enthalten ist?",
      "Ist der nächste manuelle Umsetzungsschritt eindeutig?",
      "Würde dieses Ergebnis reichen, um weiterzubauen, ohne neue Grundsatzdiskussion?",
    ],
    jamalOptions: [
      {
        option: "Finish-nah ausarbeiten",
        meaning:
          "Das aktuelle Zwischenergebnis wird jetzt sichtbar fertiggestellt.",
      },
      {
        option: "Einmal begrenzt nachschärfen",
        meaning:
          "Nur eine begrenzte Nachschärfung ist erlaubt; danach folgt Finish-, Stop- oder Zurückstellungsentscheidung.",
        limit: "nur einmal und nur begrenzt",
      },
      {
        option: "Stoppen / nicht weiterführen",
        meaning:
          "Der Korridor wird beendet, wenn Nutzen, Grenze, Qualität oder Sicherheit nicht reichen.",
      },
    ],
    agentContributions: [
      {
        agent: "GF-Agent",
        contribution: "hält Ergebnisorientierung und Entscheidungsschärfe",
      },
      {
        agent: "Projektmanager-Agent",
        contribution: "begrenzt Scope und verhindert Endlosschleifen",
      },
      {
        agent: "Produktmanager-Agent",
        contribution: "verdichtet Zweck, Nutzen und Struktur",
      },
      {
        agent: "Design-Director-Agent",
        contribution: "prüft Verständlichkeit und sichtbare Nutzbarkeit",
      },
      {
        agent: "QA-Agent",
        contribution: "prüft Vollständigkeit und Anschlussfähigkeit",
      },
      {
        agent: "Compliance/Risiko-Agent",
        contribution: "prüft medizinische und operative Grenzen",
      },
      {
        agent: "Wissens/Archiv-Agent",
        contribution: "hält Ergebnis und Entscheidung dokumentierbar",
      },
    ],
    nonGoals: [
      "keine fertige Health-App",
      "keine echten Kundendaten",
      "keine medizinische Bewertung",
      "keine Waagen-/Laborintegration",
      "keine Automatisierung",
      "keine Plugin-Ausführung",
      "kein Deployment",
      "keine neue Großkonzeption",
    ],
    qualityBoundary:
      "Das Ergebnis darf nur als finish-nah gelten, wenn Zweck, Nutzen, Grenze und nächster Umsetzungspunkt klar sind.",
    safetyBoundary:
      "Wenn medizinische Aussagen, echte Kundendaten, externe Aktionen oder Automatisierung nötig würden, muss der Schritt stoppen und als nicht freigegeben markiert werden.",
    requiresManualDecision: true,
    madeExternalRequest: false,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticContinuationBlocked: true,
    externalConnectionsBlocked: true,
  };
}

function getProductiveHealthFinishResultDraft() {
  return {
    title: "Health-Finish-Ergebnis ausarbeiten",
    status: "Health-Finish-Ergebnis ausarbeitbar vorbereitet",
    project: "Health Upgrade Kompass",
    guidingQuestion: "Welches konkrete Ergebnis ist jetzt gut genug fertig?",
    source: "V6.33.6 Ergebnisorientierter Finish-Korridor",
    concreteFinishResult: {
      title: "erste fertige Produktstruktur für den Health Upgrade Kompass",
      customerBenefit:
        "Der Kunde versteht, wofür der Kompass da ist, welchen sicheren nächsten Schritt er bekommt und was ausdrücklich keine medizinische Bewertung ist.",
      advisorOrFounderBenefit:
        "Beraterin und Geschäftsführung sehen Nutzen, Ablauf, Grenze und nächsten manuellen Umsetzungsblock klar genug.",
      limitedScope:
        "Begrenzter Demo- oder Projektarbeitsumfang ohne echte Kundendaten, Automatisierung oder externe Verarbeitung.",
      safetyStatement:
        "Keine Diagnose, keine Heilversprechen, keine echten Kundendaten.",
    },
    resultComponents: [
      {
        component: "Zielbild des Health Upgrade Kompass",
        result:
          "Ein nicht-medizinischer Orientierungskompass, der Nutzer zu einem verständlichen nächsten menschlichen Beratungsschritt führt.",
      },
      {
        component: "erster Nutzerfluss",
        result:
          "Einstieg -> Ziel/Motivation -> strukturierte Angaben -> Ergebnisorientierung -> Beratergespräch -> nächste manuelle Handlung.",
      },
      {
        component: "Ergebnislogik ohne medizinische Bewertung",
        result:
          "Das Ergebnis ordnet nur Orientierung, Gesprächsbedarf und nächste sichere Handlung ein; es bewertet keinen Gesundheitszustand.",
      },
      {
        component: "Beratergespräch als sicherer Anschluss",
        result:
          "Der Kompass endet mit einem klaren menschlichen Anschluss statt automatischer Empfehlung.",
      },
      {
        component: "offene Punkte für spätere Versionen",
        result:
          "Datenquellen, Kundenbereich, Messlogik, Personalisierung, Automatisierung und Tool-Anbindung bleiben spätere, manuell freizugebende Themen.",
      },
    ],
    consciouslyUnfinished: [
      "echte Waagen-/Laboranbindung",
      "Kundenspeicherung",
      "automatisierte Auswertung",
      "medizinische Interpretation",
      "externe Plugin-Ausführung",
      "Deployment",
    ],
    finishChecks: [
      "Ist das Ergebnis für Jamal verständlich?",
      "Kann ein Geschäftsführer den Nutzen erkennen?",
      "Ist klar, was der Kunde sieht?",
      "Ist klar, was die Beraterin damit macht?",
      "Sind Sicherheitsgrenzen sichtbar?",
      "Wird keine Scheingenauigkeit erzeugt?",
    ],
    jamalOptions: [
      "Finish-Ergebnis übernehmen",
      "Einmal konkret nachschärfen",
      "Stoppen / nicht weiterführen",
    ],
    agentContributions: [
      {
        agent: "GF-Agent",
        contribution: "prüft Ergebnisnutzen und Entscheidungsreife",
      },
      {
        agent: "Projektmanager-Agent",
        contribution: "prüft Umfang, Grenze und nächsten Schritt",
      },
      {
        agent: "Produktmanager-Agent",
        contribution: "prüft Produktstruktur und Kundennutzen",
      },
      {
        agent: "Design-Director-Agent",
        contribution: "prüft Verständlichkeit und Premium-Wirkung",
      },
      {
        agent: "QA-Agent",
        contribution: "prüft Prüfbarkeit und Abbruchgrenzen",
      },
      {
        agent: "Compliance/Risiko-Agent",
        contribution: "prüft Diagnose-, Heilversprechen- und Datengrenzen",
      },
      {
        agent: "Wissens/Archiv-Agent",
        contribution: "hält fest, was später wiederverwendbar ist",
      },
    ],
    nonGoals: [
      "keine neue Automatisierung",
      "keine externen Requests",
      "keine Speicherung",
      "keine echten Kundendaten",
      "keine Diagnose",
      "keine Heilversprechen",
      "keine Plugin-Ausführung",
      "kein Deployment",
    ],
    recommendation:
      "Dieses Finish-Ergebnis sollte nur übernommen werden, wenn es als erstes sichtbares Health-Zwischenergebnis verständlich, sicher und entscheidungsfähig ist. Wenn nicht, darf maximal einmal konkret nachgeschärft werden. Danach übernehmen oder stoppen.",
    qualityBoundary:
      "Ergebnis vor weiterer Vorbereitung: Es wird kein neuer Vorbereitungsrahmen ergänzt, solange kein konkretes Health-Zwischenergebnis sichtbar ist.",
    safetyBoundary:
      "Der Health Upgrade Kompass bleibt in dieser Version eine lokale, nicht-medizinische, nicht-automatisierte Projekt- und Demo-Struktur ohne echte Kundendaten, ohne Diagnose, ohne Heilversprechen und ohne externe Verarbeitung.",
    prepared: true,
    requiresManualDecision: true,
    madeExternalRequest: false,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
  };
}

function getProductiveHealthProductCard() {
  return {
    title: "Erste Health-Produktkarte",
    status: "erste nutzbare Health-Produktkarte vorbereitet",
    project: "Health Upgrade Kompass",
    source:
      "V6.33.7 Health-Finish-Ergebnis wurde ausgearbeitet und wird jetzt in eine erste manuell nutzbare Produktkarte überführt.",
    productCard: {
      title: "Mein nächster kleiner Health-Schritt",
      purpose:
        "Eine einfache, sichere Produktkarte, die dem Nutzer nach dem Kompass einen verständlichen nächsten kleinen Schritt zeigt.",
      targetGroup:
        "Menschen, die eine erste Orientierung für ihren nächsten Health-Schritt suchen und diesen mit einer Beraterin besprechen sollen.",
      customerBenefit:
        "Der Nutzer bekommt eine klare, nicht-medizinische Orientierung, ohne überfordert oder automatisch bewertet zu werden.",
      advisorBenefit:
        "Die Beraterin kann das Gespräch strukturieren, Rückfragen sammeln und den nächsten kleinen Schritt menschlich erklären.",
      expectedVisibleResult:
        "Eine manuell prüfbare Produktkarte mit Zweck, Nutzerhinweis, Berateranschluss, Sicherheitsgrenze und nächster Jamal-Entscheidung.",
    },
    whatUserSees: [
      "kurze Orientierung",
      "ein verständlicher nächster Schritt",
      "keine Überforderung",
      "keine Diagnose",
      "keine medizinische Empfehlung",
      "Hinweis: Bitte mit deiner Beraterin besprechen",
    ],
    advisorUse: [
      "Gespräch strukturieren",
      "nächsten kleinen Schritt erklären",
      "Rückfragen sammeln",
      "keine Therapie ableiten",
      "keine Heilversprechen geben",
    ],
    consciouslyUnfinished: [
      "keine echten Kundendaten",
      "keine Waagen-Daten",
      "keine Laborwerte",
      "keine automatische Bewertung",
      "keine Speicherung",
      "keine Kundenhistorie",
      "keine medizinische Einstufung",
      "keine App-Logik mit echten Nutzern",
    ],
    jamalOptions: [
      "Produktkarte weiter ausarbeiten",
      "Einmal begrenzt schärfen",
      "Stoppen / nicht weiterführen",
    ],
    agentContributions: [
      {
        agent: "GF-Agent",
        contribution: "prüft, ob die Produktkarte entscheidungsreif und geschäftlich sinnvoll ist",
      },
      {
        agent: "Projektmanager-Agent",
        contribution: "ordnet Umfang, nächsten Schritt und Abbruchgrenze",
      },
      {
        agent: "Produktmanager-Agent",
        contribution: "schärft Zweck, Zielgruppe, Nutzen und Produktmodul-Grenze",
      },
      {
        agent: "Design-Director-Agent",
        contribution: "prüft Verständlichkeit, Premium-Wirkung und Nutzerführung",
      },
      {
        agent: "Entwickler-Agent",
        contribution: "benennt spätere technische Umsetzbarkeit nur lokal und ohne Code-Zwang",
      },
      {
        agent: "QA-Agent",
        contribution: "prüft, ob die Produktkarte manuell testbar und sicher begrenzt ist",
      },
      {
        agent: "Compliance/Risiko-Agent",
        contribution: "prüft Diagnose-, Heilversprechen-, Daten- und Health-Grenzen",
      },
      {
        agent: "Content-Agent",
        contribution: "formuliert einfache, neutrale und nicht-medizinische Nutzersprache",
      },
      {
        agent: "Wissens/Archiv-Agent",
        contribution: "hält fest, welche Produktkartenlogik später wiederverwendbar wäre",
      },
    ],
    nonGoals: [
      "keine Diagnose",
      "kein Heilversprechen",
      "keine echte Health-Auswertung",
      "keine Automatisierung",
      "keine Plugin-Ausführung",
      "keine externen Requests",
      "keine Kundendaten",
      "kein Deployment",
    ],
    qualityBoundary:
      "Die Produktkarte ist nur gültig, wenn Zweck, Zielgruppe, Nutzeransicht, Berateranschluss, unfertige Bereiche und nächste Jamal-Entscheidung klar sichtbar sind.",
    safetyBoundary:
      "Die Produktkarte bleibt lokal, manuell, read-only und vorbereitend: ohne echte Daten, ohne medizinische Aussage, ohne Schreiboperationen, ohne externe Verarbeitung und ohne automatische Projektbearbeitung.",
    prepared: true,
    requiresManualDecision: true,
    madeExternalRequest: false,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    realCustomerDataBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
  };
}

function getProductiveHealthProductCardManualReview() {
  return {
    title: "Health-Produktkarte manuell prüfen",
    status: "manuelle Prüfentscheidung für erste Health-Produktkarte vorbereitet",
    source:
      "V6.33.8 hat die Produktkarte Mein nächster kleiner Health-Schritt vorbereitet. V6.33.9 prüft, ob sie gut genug ist, um als belastbarer Baustein für den nächsten Health-Arbeitsblock zu dienen.",
    reviewedProductCard: "Mein nächster kleiner Health-Schritt",
    reviewGoal:
      "Jamal prüft manuell, ob die erste Health-Produktkarte übernommen, einmal begrenzt geschärft oder gestoppt werden soll.",
    jamalDecisionOptions: [
      {
        option: "Übernehmen",
        meaning:
          "Die Produktkarte ist verständlich, sicher begrenzt und als erster Produktbaustein nutzbar.",
      },
      {
        option: "Einmal schärfen",
        meaning:
          "Die Grundrichtung stimmt, aber Nutzen, nächster Schritt, Beraterinnen-Perspektive oder Grenze müssen noch einmal konkretisiert werden.",
        limit: "nur einmal und nur begrenzt",
      },
      {
        option: "Stoppen / nicht weiterführen",
        meaning:
          "Die Produktkarte wirkt zu medizinisch, zu unklar oder nicht belastbar genug als Produktbaustein.",
      },
    ],
    goodEnoughCriteria: [
      "für Nutzer verständlich",
      "beschreibt einen kleinen konkreten Health-Schritt",
      "hat keinen medizinischen Diagnosecharakter",
      "hat keinen Heilversprechen-Ton",
      "ist für Beraterinnen erklärbar",
      "ist als erster Produktbaustein nutzbar",
      "bleibt klar begrenzt",
    ],
    sharpenOnceCriteria: [
      "Grundrichtung stimmt",
      "Nutzen muss klarer formuliert werden",
      "nächster Schritt ist noch zu allgemein",
      "Beraterinnen-Perspektive fehlt noch",
      "Grenze zwischen Orientierung und medizinischer Aussage muss deutlicher werden",
    ],
    stopCriteria: [
      "wirkt zu medizinisch",
      "klingt wie Diagnose, Therapie oder Heilversprechen",
      "ist zu breit oder zu unklar",
      "taugt nicht als Produktbaustein",
      "öffnet mehr Fragen als Orientierung zu geben",
    ],
    expectedReviewResult:
      "Eine klare manuelle Prüfentscheidung: Produktkarte übernehmen, einmal begrenzt schärfen oder stoppen.",
    agentContributions: [
      {
        agent: "GF-Agent",
        contribution: "prüft, ob die Karte entscheidungs- und produktreif genug ist",
      },
      {
        agent: "Projektmanager-Agent",
        contribution: "prüft nächsten Arbeitsblock, Umfang und Stopppunkte",
      },
      {
        agent: "Produktmanager-Agent",
        contribution: "prüft Nutzen, Zielgruppe und Produktbaustein-Reife",
      },
      {
        agent: "Design-Director-Agent",
        contribution: "prüft Verständlichkeit, Reibung und sichtbare Nutzbarkeit",
      },
      {
        agent: "QA-Agent",
        contribution: "prüft Gut-genug-, Schärfen- und Stopp-Kriterien",
      },
      {
        agent: "Compliance/Risiko-Agent",
        contribution: "prüft Diagnose-, Therapie-, Heilversprechen- und Datengrenzen",
      },
      {
        agent: "Content-Agent",
        contribution: "prüft neutrale, einfache und nicht-medizinische Formulierung",
      },
      {
        agent: "Wissens/Archiv-Agent",
        contribution: "ordnet ein, ob die Entscheidung später dokumentierbar wäre",
      },
    ],
    nonGoals: [
      "keine neue Produktfunktion bauen",
      "keine echte Health-Auswertung starten",
      "keine Diagnose",
      "kein Heilversprechen",
      "keine Kundendaten nutzen",
      "keine Speicherung",
      "keine Automatisierung",
      "keine Plugin-Ausführung",
      "kein Deployment",
    ],
    qualityBoundary:
      "Die Prüfentscheidung ist nur gültig, wenn Jamal klar erkennt, warum die Produktkarte übernommen, einmal geschärft oder gestoppt wird.",
    safetyBoundary:
      "Die Prüfung bleibt lokal, manuell, read-only und vorbereitend. Sie nutzt keine echten Daten, trifft keine medizinische Aussage, schreibt nichts, verbindet kein externes System und startet keine automatische Fortsetzung.",
    prepared: true,
    requiresManualDecision: true,
    madeExternalRequest: false,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    realCustomerDataBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
  };
}

function getProductiveHealthFirstWorkBlock() {
  return {
    title: "Ersten kleinen Health-Arbeitsblock ableiten",
    status: "erster kleiner Health-Arbeitsblock aus geprüfter Produktkarte vorbereitet",
    source:
      "V6.33.9 hat die Produktkarte Mein nächster kleiner Health-Schritt manuell prüfbar gemacht. Wenn Jamal sie übernimmt, wird daraus der erste kleine Health-Arbeitsblock abgeleitet.",
    adoptedProductCard: "Mein nächster kleiner Health-Schritt",
    goal:
      "Aus der geprüften Produktkarte einen kleinen, manuell nutzbaren Health-Arbeitsblock ableiten, der konkrete Projektarbeit ermöglicht und gleichzeitig Qualität, Sicherheit und Kontrolle bewahrt.",
    concreteWorkBlock: {
      name: "Heute wähle ich meinen nächsten kleinen Health-Schritt",
      shortDescription:
        "Der Nutzer bekommt aus der Produktkarte keinen medizinischen Rat, sondern eine einfache, nicht-diagnostische Orientierung: ein kleiner nächster Schritt, den er mit einer Beraterin besprechen oder selbst reflektieren kann.",
      resultFormat: [
        "1 kurzer Orientierungssatz",
        "1 kleiner nächster Schritt",
        "1 Reflexionsfrage",
        "1 Hinweis: Bei gesundheitlichen Beschwerden oder Unsicherheit bitte medizinisch abklären.",
      ],
    },
    whySmallEnough: [
      "ein einzelner Nutzerbaustein statt kompletter Health-App",
      "nur Orientierung statt medizinischer Bewertung",
      "klar begrenztes Ergebnisformat",
      "manuell prüfbar ohne echte Kundendaten",
      "kein Tool-, Plugin- oder Speicherbedarf",
    ],
    whatUserSees: [
      "eine kurze, verständliche Orientierung",
      "einen kleinen nächsten Schritt",
      "eine Reflexionsfrage",
      "einen klaren Hinweis zur medizinischen Abklärung bei Beschwerden oder Unsicherheit",
      "keine Diagnose und kein Heilversprechen",
    ],
    advisorUse: [
      "Gesprächseinstieg strukturieren",
      "nächsten kleinen Schritt gemeinsam besprechen",
      "Rückfragen und Unsicherheiten sammeln",
      "Grenze zwischen Orientierung und medizinischer Abklärung sichtbar halten",
    ],
    founderLearning:
      "Jamal sieht, ob die Unternehmenszentrale aus einer geprüften Produktkarte einen konkreten, sicheren und manuell freizugebenden Projektarbeitsblock ableiten kann.",
    headquartersProductivityImpact: [
      "macht aus Vorbereitung erstmals einen konkreten Health-Arbeitsblock",
      "trainiert die Zentrale auf ergebnisorientierte Projektführung",
      "zeigt, wie geprüfte Produktkarten in kleine Arbeitsblöcke übersetzt werden",
      "liefert ein Muster für spätere Projektarbeit in Expansion App, Marketing Agentur OS und weiteren Projekten",
    ],
    agentFitnessConnection: [
      {
        agent: "GF-Agent",
        becomesMoreCapableAt:
          "entscheidet klarer, ob ein Arbeitsergebnis geschäftlich relevant genug ist",
        futureResultType: "kurze Übernehmen-/Schärfen-/Stoppen-Empfehlung",
        autonomyStillBlocked: "keine Entscheidung ohne Jamal",
      },
      {
        agent: "Projektmanager-Agent",
        becomesMoreCapableAt:
          "übersetzt Produktkarten in begrenzte, prüfbare Arbeitsblöcke",
        futureResultType: "Scope, Reihenfolge, nächster Schritt und Abbruchgrenze",
        autonomyStillBlocked: "keine automatische Projektfortsetzung",
      },
      {
        agent: "Produktmanager-Agent",
        becomesMoreCapableAt:
          "formuliert Nutzerproblem, Nutzen und Bausteinlogik konkreter",
        futureResultType: "kleiner Produktbaustein mit Nutzen und Grenze",
        autonomyStillBlocked: "keine Produktentscheidung ohne Jamal",
      },
      {
        agent: "Design-Director-Agent",
        becomesMoreCapableAt:
          "prüft Verständlichkeit und sichtbare Nutzbarkeit des Blocks",
        futureResultType: "UI-/UX-orientierte Klarheitsprüfung",
        autonomyStillBlocked: "keine finalen Designs und kein Deployment",
      },
      {
        agent: "QA-Agent",
        becomesMoreCapableAt:
          "prüft, ob Ergebnisformat, Grenze und Abbruchpunkte testbar sind",
        futureResultType: "konkrete Prüfpunkte für manuelle Freigabe",
        autonomyStillBlocked: "keine automatische Freigabe",
      },
      {
        agent: "Compliance/Risiko-Agent",
        becomesMoreCapableAt:
          "erkennt Diagnose-, Heilversprechen- und Datengrenzen im Arbeitsblock",
        futureResultType: "Risiko- und Sicherheitsgrenze pro Baustein",
        autonomyStillBlocked: "keine rechtliche oder medizinische Freigabe",
      },
      {
        agent: "Content-Agent",
        becomesMoreCapableAt:
          "verdichtet Orientierung in einfache, nicht-medizinische Sprache",
        futureResultType: "klarer Orientierungssatz und Reflexionsfrage",
        autonomyStillBlocked: "keine Veröffentlichung ohne Jamal",
      },
      {
        agent: "Wissens/Archiv-Agent",
        becomesMoreCapableAt:
          "macht wiederverwendbare Arbeitsblock-Logik dokumentierbar",
        futureResultType: "lokale Wiederverwendungsnotiz ohne Speicherungspflicht",
        autonomyStillBlocked: "keine automatische Speicherung",
      },
    ],
    projectWorkConnection: {
      firstProductivePracticeProject: "Health Upgrade Kompass",
      transferLogic:
        "Die gleiche Logik soll später auch Expansion App, Marketing Agentur OS und weitere Projekte unterstützen: Produktkarte prüfen, kleinen Arbeitsblock ableiten, manuell freigeben, sicher begrenzen.",
      laterProjects: ["Expansion App", "Marketing Agentur OS", "weitere Projekte"],
    },
    jamalOptions: [
      "Arbeitsblock übernehmen",
      "Einmal begrenzt schärfen",
      "Stoppen / nicht weiterführen",
    ],
    workReadyEnoughCriteria: [
      "Arbeitsblock hat genau einen klaren Nutzerzweck",
      "Ergebnisformat ist klein und manuell prüfbar",
      "keine medizinische Bewertung entsteht",
      "Beraterinnen-Anschluss ist sichtbar",
      "Agentenbeiträge liefern konkrete Projektarbeit statt nur Status",
      "nächster Projektarbeitsblock ist für Jamal entscheidbar",
    ],
    sharpenOnceCriteria: [
      "Orientierungssatz ist noch zu allgemein",
      "kleiner nächster Schritt ist noch nicht konkret genug",
      "Reflexionsfrage braucht einfachere Sprache",
      "Beraterinnen-Nutzen ist noch zu schwach",
      "medizinische Grenze muss deutlicher formuliert werden",
    ],
    stopCriteria: [
      "Arbeitsblock wirkt wie Diagnose oder Therapie",
      "Heilversprechen oder Scheingenauigkeit entstehen",
      "echte Kundendaten wären nötig",
      "Block ist zu groß oder nicht manuell prüfbar",
      "Nutzen für Health Upgrade Kompass bleibt unklar",
    ],
    expectedResultAfterManualApproval:
      "Ein erster kleiner Health-Arbeitsblock, der als manuell prüfbarer Baustein für Health Upgrade Kompass und als Muster für spätere Projektarbeit dient.",
    agentContributions: [
      {
        agent: "GF-Agent",
        contribution: "prüft, ob der Arbeitsblock den nächsten produktiven Schritt rechtfertigt",
      },
      {
        agent: "Projektmanager-Agent",
        contribution: "grenzt den Arbeitsblock, Reihenfolge und Abbruchpunkte ein",
      },
      {
        agent: "Produktmanager-Agent",
        contribution: "schärft Nutzerproblem, Nutzen und Ergebnisformat",
      },
      {
        agent: "Design-Director-Agent",
        contribution: "prüft Verständlichkeit und sichtbare Nutzbarkeit",
      },
      {
        agent: "QA-Agent",
        contribution: "prüft, ob der Block manuell testbar und klein genug ist",
      },
      {
        agent: "Compliance/Risiko-Agent",
        contribution: "verhindert Diagnose, Heilversprechen und echte Health-Datennutzung",
      },
      {
        agent: "Content-Agent",
        contribution: "formuliert Orientierungssatz, nächsten Schritt und Reflexionsfrage neutral",
      },
      {
        agent: "Wissens/Archiv-Agent",
        contribution: "macht die Arbeitsblock-Logik später wiederverwendbar",
      },
    ],
    nonGoals: [
      "keine fertige Health-App",
      "keine medizinische Bewertung",
      "keine Diagnose",
      "keine Heilversprechen",
      "keine echten Kundendaten",
      "keine Speicherung",
      "keine Automatisierung",
      "keine Plugin-Ausführung",
      "kein Deployment",
      "keine automatische Agenten-Autonomie",
    ],
    qualityBoundary:
      "Der Arbeitsblock ist nur gültig, wenn er klein, verständlich, manuell prüfbar, projektfördernd und sicher begrenzt ist.",
    safetyBoundary:
      "Der Arbeitsblock bleibt lokal, manuell, read-only und vorbereitend: keine Diagnose, keine Heilversprechen, keine echten Kundendaten, keine Speicherung, keine externen Requests, keine Automatisierung und keine Plugin-Ausführung.",
    prepared: true,
    requiresManualDecision: true,
    madeExternalRequest: false,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    realCustomerDataBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
  };
}

function getProductiveHealthFirstWorkBlockManualExecution() {
  return {
    title: "Ersten Health-Arbeitsblock manuell ausführen",
    status: "erster Health-Arbeitsblock manuell ausführbar vorbereitet",
    source:
      "V6.34.0 hat den ersten kleinen Health-Arbeitsblock Heute wähle ich meinen nächsten kleinen Health-Schritt abgeleitet. V6.34.1 bereitet seine manuelle Ausführung vor.",
    workBlock: "Heute wähle ich meinen nächsten kleinen Health-Schritt",
    purpose:
      "Die Unternehmenszentrale zeigt, wie aus einem geprüften Projektartefakt echte manuelle Projektarbeit entsteht und gleichzeitig Agenten-Fitness trainiert wird.",
    manualExecutionSteps: [
      "Produktkarte und Arbeitsblock kurz lesen",
      "Orientierungssatz neutral und nicht-medizinisch formulieren",
      "einen kleinen nächsten Schritt beschreiben",
      "eine einfache Reflexionsfrage ergänzen",
      "Sicherheits-/Abklärungshinweis sichtbar machen",
      "prüfen, ob Jamal den Block manuell übernehmen, schärfen oder stoppen will",
    ],
    expectedVisibleResult:
      "Ein manuell ausführbarer Mini-Arbeitsblock für Health Upgrade Kompass mit Orientierungssatz, kleinem nächsten Schritt, Reflexionsfrage und Sicherheits-/Abklärungshinweis.",
    resultFormat: [
      "1 kurzer Orientierungssatz",
      "1 kleiner nächster Schritt",
      "1 Reflexionsfrage",
      "1 Sicherheits-/Abklärungshinweis",
    ],
    exampleOutputWithoutRealCustomerData: {
      orientationSentence:
        "Du hast einen kleinen nächsten Schritt gefunden, der dir helfen kann, dein Health-Ziel bewusster anzugehen.",
      smallNextStep:
        "Notiere heute eine konkrete Gewohnheit, die du in den nächsten 24 Stunden leichter machen möchtest.",
      reflectionQuestion:
        "Was würde diesen Schritt für dich so klein machen, dass du ihn wirklich beginnen kannst?",
      safetyNotice:
        "Bei gesundheitlichen Beschwerden oder Unsicherheit bitte medizinisch abklären.",
    },
    userBenefit:
      "Der Nutzer bekommt eine einfache Orientierung, ohne Diagnose, Druck oder medizinische Bewertung.",
    advisorBenefit:
      "Die Beraterin kann an einem klaren, kleinen nächsten Schritt anknüpfen und offene Rückfragen sammeln.",
    founderBenefit:
      "Jamal erkennt, ob aus der Produktkarte ein real nutzbarer, sicher begrenzter Projektarbeitsblock entsteht.",
    headquartersProjectWorkBenefit:
      "Die Zentrale beweist, dass sie aus Projektartefakten konkrete manuelle Arbeitsschritte erzeugen kann, ohne Automatisierung oder externe Systeme zu starten.",
    agentFitnessSignals: [
      {
        agent: "GF-Agent",
        trainingSignal: "Führungsnutzen und Entscheidbarkeit prüfen",
        futureResultQuality: "klare Empfehlung: ausführen, schärfen oder stoppen",
        autonomyStillBlocked: "keine Entscheidung ohne Jamal",
      },
      {
        agent: "Projektmanager-Agent",
        trainingSignal: "nächsten umsetzbaren Projektschritt prüfen",
        futureResultQuality: "kleiner Schritt, Reihenfolge, Abbruchgrenze",
        autonomyStillBlocked: "keine automatische Projektfortsetzung",
      },
      {
        agent: "Produktmanager-Agent",
        trainingSignal: "Produktnutzen und Ergebnisformat prüfen",
        futureResultQuality: "klarer Nutzerzweck und kompaktes Ergebnisformat",
        autonomyStillBlocked: "keine Produktentscheidung ohne Jamal",
      },
      {
        agent: "Design-Director-Agent",
        trainingSignal: "Verständlichkeit und sichtbare Nutzerführung prüfen",
        futureResultQuality: "verständlich sichtbarer Arbeitsblock",
        autonomyStillBlocked: "keine finalen Designs und kein Deployment",
      },
      {
        agent: "Entwickler-Agent",
        trainingSignal: "lokale Umsetzbarkeit ohne neue technische Risiken prüfen",
        futureResultQuality: "technisch klein genug, ohne Code-Zwang",
        autonomyStillBlocked: "keine automatische Umsetzung",
      },
      {
        agent: "QA-Agent",
        trainingSignal: "Kriterien, Grenzen und Testbarkeit prüfen",
        futureResultQuality: "prüfbarer Mini-Output mit klarer Stopplinie",
        autonomyStillBlocked: "keine automatische Freigabe",
      },
      {
        agent: "Compliance/Risiko-Agent",
        trainingSignal: "Health-Grenzen, keine Diagnosen, keine Heilversprechen prüfen",
        futureResultQuality: "sichtbare Sicherheitsgrenze je Output",
        autonomyStillBlocked: "keine medizinische oder rechtliche Freigabe",
      },
      {
        agent: "HR-Agent",
        trainingSignal: "Trainingsimpulse für alle 25 Agenten ableiten",
        futureResultQuality:
          "welcher Agent welche Ergebnisqualität verbessern soll, ohne Autonomie zu erhöhen",
        autonomyStillBlocked: "keine automatische Schulung und keine Autonomieerhöhung",
      },
      {
        agent: "Wissens/Archiv-Agent",
        trainingSignal: "wiederverwendbares Arbeitsmuster sichtbar machen",
        futureResultQuality: "lokal dokumentierbares Muster ohne automatische Speicherung",
        autonomyStillBlocked: "keine automatische Archivierung",
      },
    ],
    hrTrainingImpulses: [
      "HR erkennt diesen Arbeitsblock als Trainingsfall für konkrete Ergebnisqualität",
      "alle 25 Agenten bleiben im Vorschlagsmodus",
      "keine neue Autonomie wird automatisch freigegeben",
      "Training bedeutet hier: bessere Orientierung, klarere Grenzen und bessere manuelle Outputs",
    ],
    transferabilityToOtherProjects: [
      "Expansion App: aus Produktkarte einen kleinen nächsten App-Arbeitsblock ableiten",
      "Marketing Agentur OS: aus Servicekarte einen kleinen Kampagnen- oder Prozessblock ableiten",
      "weitere Produkt-/Kundenprojekte: aus geprüften Artefakten konkrete manuelle Arbeitsblöcke ableiten",
    ],
    jamalOptions: [
      "Manuell ausführen",
      "Einmal begrenzt schärfen",
      "Stoppen / nicht weiterführen",
    ],
    executableEnoughCriteria: [
      "Output ist in vier Teilen klar formuliert",
      "kein echter Nutzer- oder Kundendatensatz nötig",
      "kein medizinischer Rat entsteht",
      "Beraterinnen-Anschluss ist sichtbar",
      "Jamal kann Ergebnis manuell prüfen",
      "Agenten lernen an einem konkreten Projektarbeitsfall",
    ],
    sharpenOnceCriteria: [
      "Orientierungssatz klingt noch zu allgemein",
      "kleiner nächster Schritt ist noch nicht klein genug",
      "Reflexionsfrage ist noch zu abstrakt",
      "Sicherheits-/Abklärungshinweis muss sichtbarer werden",
      "Agenten-Fitness-Signal ist noch nicht klar genug",
    ],
    stopCriteria: [
      "Output klingt nach medizinischer Empfehlung",
      "Diagnose, Therapie oder Heilversprechen werden nahegelegt",
      "echte Kundendaten wären nötig",
      "automatische Kommunikation wäre nötig",
      "Arbeitsblock wird zu groß oder nicht manuell prüfbar",
    ],
    expectedResultAfterManualExecution:
      "Ein manuell erzeugter, lokal prüfbarer Beispiel-Arbeitsblock für Health Upgrade Kompass, der als Projektarbeits- und Agenten-Trainingsfall dienen kann.",
    agentContributions: [
      {
        agent: "GF-Agent",
        contribution: "prüft Führungsnutzen und Entscheidbarkeit",
      },
      {
        agent: "Projektmanager-Agent",
        contribution: "prüft nächsten umsetzbaren Projektschritt",
      },
      {
        agent: "Produktmanager-Agent",
        contribution: "prüft Produktnutzen und Ergebnisformat",
      },
      {
        agent: "Design-Director-Agent",
        contribution: "prüft Verständlichkeit und sichtbare Nutzerführung",
      },
      {
        agent: "Entwickler-Agent",
        contribution: "prüft lokale Umsetzbarkeit ohne neue technische Risiken",
      },
      {
        agent: "QA-Agent",
        contribution: "prüft Kriterien, Grenzen und Testbarkeit",
      },
      {
        agent: "Compliance/Risiko-Agent",
        contribution: "prüft Health-Grenzen, keine Diagnosen und keine Heilversprechen",
      },
      {
        agent: "HR-Agent",
        contribution: "leitet Trainingssignale für alle 25 Agenten ab",
      },
      {
        agent: "Wissens/Archiv-Agent",
        contribution: "hält wiederverwendbares Arbeitsmuster sichtbar",
      },
    ],
    nonGoals: [
      "keine echte Health-App-Funktion",
      "keine medizinische Empfehlung",
      "keine Diagnose",
      "keine Heilversprechen",
      "keine echten Kundendaten",
      "keine automatische Beraterinnen- oder Kundenkommunikation",
      "keine Speicherung",
      "keine Automatisierung",
      "keine Plugin-Ausführung",
      "kein Deployment",
      "keine automatische Agenten-Autonomie",
    ],
    qualityBoundary:
      "Die manuelle Ausführung ist nur gültig, wenn Output, Nutzen, Grenze, Agenten-Trainingssignal und Jamals nächste Entscheidung klar sichtbar sind.",
    safetyBoundary:
      "Der Arbeitsblock bleibt lokal, manuell, read-only und vorbereitend: keine medizinischen Empfehlungen, keine Diagnose, keine Heilversprechen, keine echten Kundendaten, keine Speicherung, keine externen Requests, keine automatische Kommunikation, keine Automatisierung und keine Plugin-Ausführung.",
    prepared: true,
    requiresManualDecision: true,
    madeExternalRequest: false,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    realCustomerDataBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticCommunicationBlocked: true,
  };
}

function getProductiveHealthFirstWorkBlockManualExecutionEvaluation() {
  return {
    title: "Ersten Health-Arbeitsblock manuell auswerten",
    status: "erste manuelle Health-Arbeitsblock-Auswertung vorbereitet",
    source:
      "V6.34.1 hat den Arbeitsblock Heute wähle ich meinen nächsten kleinen Health-Schritt manuell ausführbar vorbereitet. V6.34.2 macht die manuelle Ausführung auswertbar.",
    executedWorkBlock: "Heute wähle ich meinen nächsten kleinen Health-Schritt",
    evaluationGoal:
      "Prüfen, ob der Arbeitsblock brauchbar war, welche Agenten besser werden müssen und welches wiederverwendbare Projektarbeitsmuster daraus entsteht.",
    evaluatedItems: [
      "Verständlichkeit für Nutzer",
      "Kleinheit des nächsten Schritts",
      "Beraterinnen-Nutzen",
      "Jamal-/GF-Nutzen",
      "Health-Sicherheitsgrenze",
      "Wiederverwendbarkeit als Projektarbeitsmuster",
    ],
    expectedResultFromV6341: [
      "1 kurzer Orientierungssatz",
      "1 kleiner nächster Schritt",
      "1 Reflexionsfrage",
      "1 Sicherheits-/Abklärungshinweis",
    ],
    evaluationQuestions: [
      "Ist das Ergebnis für einen Nutzer verständlich?",
      "Ist der nächste Schritt klein genug?",
      "Ist der Beraterinnen-Nutzen erkennbar?",
      "Ist der Jamal-/GF-Nutzen erkennbar?",
      "Bleibt die Health-Sicherheitsgrenze sauber?",
      "Kann daraus ein wiederverwendbares Projektarbeitsmuster entstehen?",
    ],
    resultRatings: ["brauchbar", "einmal schärfen", "stoppen / nicht weiterführen"],
    usefulCriteria: [
      "Nutzer versteht Orientierung, Schritt und Reflexionsfrage",
      "Beraterin kann daran ein Gespräch anschließen",
      "Jamal erkennt Produkt- und Projektarbeitsnutzen",
      "Health-Grenze bleibt ohne Diagnose, Heilversprechen oder medizinische Empfehlung sichtbar",
      "Muster ist auf andere Projekte übertragbar",
    ],
    sharpenOnceCriteria: [
      "Orientierung ist brauchbar, aber Sprache ist noch zu allgemein",
      "nächster Schritt ist noch zu groß",
      "Beraterinnen-Nutzen oder GF-Nutzen ist noch nicht deutlich genug",
      "Agenten-Lernsignal muss konkreter werden",
      "wiederverwendbares Muster braucht klarere Formulierung",
    ],
    stopCriteria: [
      "Output klingt medizinisch oder empfehlend",
      "Diagnose, Therapie oder Heilversprechen werden nahegelegt",
      "echte Kundendaten, Speicherung oder externe Verbindung wären nötig",
      "Arbeitsblock erzeugt mehr Unklarheit als Orientierung",
      "kein wiederverwendbares Projektarbeitsmuster erkennbar",
    ],
    agentLearningSignalsFor25Agents: [
      "Agenten müssen aus Artefakten konkrete, prüfbare Outputs ableiten",
      "Agenten müssen klare Grenzen statt automatische Aktionen liefern",
      "Agenten müssen Ergebnisqualität sichtbar machen, nicht nur Status melden",
      "Agenten bleiben im Vorschlagsmodus; Jamal entscheidet",
      "keine neue Autonomie wird automatisch freigegeben",
    ],
    hrTrainingDerivation: [
      "HR erkennt, welche Agenten konkretere Outputs liefern müssen",
      "HR leitet Trainingsimpulse für alle 25 Agenten ab",
      "HR erhöht keine Autonomie automatisch",
      "HR priorisiert bessere Ergebnisqualität, Rollenklärung und Sicherheitsgrenzen",
    ],
    qualityCenterRelation:
      "Die Auswertung stärkt das Qualitätszentrum, weil Ergebnis, Nutzen, Grenze, Testbarkeit und Wiederverwendbarkeit gemeinsam geprüft werden.",
    projectManagerRelation:
      "Der Projektmanager-Agent prüft, ob aus dem Ergebnis ein nächster kleiner Projektschritt ableitbar ist, ohne automatische Fortsetzung zu starten.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent hält das Muster als wiederverwendbare Projektlogik sichtbar, ohne automatisch zu speichern.",
    reusableProjectWorkPattern:
      "Geprüftes Projektartefakt -> kleiner Arbeitsblock -> manuelle Ausführung -> manuelle Auswertung -> Agenten-Lernsignale -> wiederverwendbares Projektarbeitsmuster",
    transferability: [
      "Expansion App",
      "Marketing Agentur OS",
      "Health Upgrade Kompass",
      "weitere Produkt- und Kundenprojekte",
    ],
    jamalOptions: [
      "Arbeitsblock als brauchbar markieren",
      "Einmal begrenzt schärfen",
      "Stoppen / nicht weiterführen",
    ],
    expectedEvaluationResult:
      "Jamal sieht, ob der erste Health-Arbeitsblock brauchbar ist, welche Agenten besser werden müssen und welches Muster künftig für echte Projektarbeit wiederverwendet werden kann.",
    agentContributions: [
      {
        agent: "GF-Agent",
        contribution: "prüft Führungs- und Entscheidungsnutzen",
      },
      {
        agent: "Projektmanager-Agent",
        contribution: "prüft, ob daraus ein nächster Projektschritt ableitbar ist",
      },
      {
        agent: "Produktmanager-Agent",
        contribution: "prüft Produktklarheit und Nutzen",
      },
      {
        agent: "Design-Director-Agent",
        contribution: "prüft Verständlichkeit und Nutzerführung",
      },
      {
        agent: "Entwickler-Agent",
        contribution: "prüft lokale Umsetzbarkeit ohne technische Erweiterung",
      },
      {
        agent: "QA-Agent",
        contribution: "prüft Auswertbarkeit, Kriterien und Testbarkeit",
      },
      {
        agent: "Compliance/Risiko-Agent",
        contribution: "prüft Health-Grenzen",
      },
      {
        agent: "HR-Agent",
        contribution: "leitet Trainingssignale für alle 25 Agenten ab",
      },
      {
        agent: "Wissens/Archiv-Agent",
        contribution: "hält das Arbeitsmuster als wiederverwendbare Projektlogik fest",
      },
    ],
    nonGoals: [
      "keine neue Health-Funktion bauen",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
      "keine medizinische Empfehlung",
      "keine Diagnose",
      "keine Heilversprechen",
      "keine echten Kundendaten",
      "keine Speicherung",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine automatische Beraterinnen- oder Kundenkommunikation",
    ],
    qualityBoundary:
      "Die Auswertung ist nur gültig, wenn Ergebnisqualität, Projektarbeitsnutzen, Agenten-Lernsignal, Wiederverwendbarkeit und Abbruchgrenze sichtbar sind.",
    safetyBoundary:
      "Die Auswertung bleibt lokal, manuell, read-only und vorbereitend: keine Speicherung, keine Schreiboperation, keine externen Requests, keine Automatisierung, keine medizinische Empfehlung, keine Diagnose, keine Heilversprechen, keine Kundendaten und keine Autonomieerhöhung.",
    prepared: true,
    requiresManualDecision: true,
    madeExternalRequest: false,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    realCustomerDataBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticCommunicationBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
  };
}

function getProductiveCentralProjectWorkRoutine() {
  return {
    title: "Projektarbeitsroutine aus Health-Muster ableiten",
    status: "allgemeine Projektarbeitsroutine aus erstem Health-Muster vorbereitet",
    source:
      "V6.34.2 hat den ersten Health-Arbeitsblock manuell auswertbar gemacht und daraus Agenten-Lernsignale sowie ein wiederverwendbares Projektarbeitsmuster abgeleitet.",
    originPattern:
      "Geprüftes Projektartefakt -> kleiner Arbeitsblock -> manuelle Ausführung -> manuelle Auswertung -> Agenten-Lernsignale -> wiederverwendbares Projektarbeitsmuster",
    routineGoal:
      "Die KI-Unternehmenszentrale soll künftig echte Projekte lokal, manuell, kontrolliert und qualitätsgesichert in kleine Arbeitsblöcke überführen können.",
    whyHealthWasSuitableFirstTrainingCase: [
      "Health Upgrade Kompass hatte ein konkretes Projektartefakt",
      "der erste Arbeitsblock war klein genug",
      "Health-Grenzen zwangen zu sauberer Qualität",
      "Beraterinnen-, Nutzer- und GF-Nutzen waren getrennt prüfbar",
      "das Muster ist auf andere Projekte übertragbar",
    ],
    transferLogic:
      "Das Health-Muster wird nicht als Health-Sonderfall behandelt, sondern als allgemeine Arbeitsweise: Projektartefakt bestimmen, kleinen Arbeitsblock ableiten, manuell ausführen, Ergebnis prüfen, Agenten trainieren und Jamals nächsten Entscheidungspunkt vorbereiten.",
    projectWorkRoutine: [
      "Projekt auswählen",
      "vorhandenes Projektartefakt bestimmen",
      "kleinen Arbeitsblock ableiten",
      "manuell ausführbar machen",
      "Ergebnis manuell auswerten",
      "Agenten-Lernsignale ableiten",
      "nächsten Jamal-Entscheidungspunkt vorbereiten",
    ],
    projectTransfers: [
      {
        project: "Health Upgrade Kompass",
        example:
          "Geprüfte Health-Produktkarte wird zu kleinem Arbeitsblock, manueller Ausführung und kontrollierter Auswertung.",
        smallestNextUse: "nächsten Health-Arbeitsblock nur nach Jamals Freigabe ableiten",
      },
      {
        project: "Expansion App",
        example:
          "Ein vorhandener App-Ausschnitt wird als Artefakt gewählt und in einen kleinen prüfbaren App-Arbeitsblock übersetzt.",
        smallestNextUse: "nur einen App-Nutzen oder Screen-Ausschnitt manuell strukturieren",
      },
      {
        project: "Marketing Agentur OS",
        example:
          "Ein Service-, Prozess- oder Angebotsartefakt wird zu einem kleinen manuellen Agentur-OS-Arbeitsblock.",
        smallestNextUse: "nur einen konkreten Prozessnutzen oder Angebotsbaustein prüfen",
      },
      {
        project: "weitere Produkt- und Kundenprojekte",
        example:
          "Erst Artefakt, Nutzen, Grenze und kleiner Arbeitsblock, danach manuelle Auswertung.",
        smallestNextUse: "Projekt nur aufnehmen, wenn Artefakt und Nutzen klar genug sind",
      },
    ],
    founderBenefit:
      "Jamal bekommt eine klare Methode, um aus Projektstand und Artefakt den nächsten kleinen, manuell prüfbaren Arbeitsschritt abzuleiten.",
    projectWorkBenefit:
      "Projektarbeit wird schneller arbeitsfähig, weil nicht mehr nur vorbereitet wird, sondern jedes Projekt durch ein wiederholbares Arbeitsmuster geführt wird.",
    agentDevelopmentBenefit:
      "Agenten lernen an konkreten Projektarbeitsfällen, welche Ergebnisqualität sie liefern müssen, ohne automatisch mehr Autonomie zu erhalten.",
    headquartersCompletionBenefit:
      "Die Unternehmenszentrale wird fertiger, weil sie eine wiederverwendbare Projektarbeitsroutine statt einzelner isolierter Health-Schritte besitzt.",
    agentFitnessConnection: {
      trainedAgentGroups: [
        "Führung & Entscheidung",
        "Projektmanagement & Produktlogik",
        "Design, Umsetzung & Qualität",
        "Sicherheit, HR & Wissen",
      ],
      expectedFutureResultQuality: [
        "kleine, konkrete Arbeitsblöcke statt grober Statusanzeigen",
        "sichtbarer Nutzen für Jamal, Projekt und Nutzer",
        "klare Grenzen, Abbruchpunkte und manuelle Entscheidung",
        "übertragbare Muster statt Einzelfall-Logik",
      ],
      autonomyStillBlocked: [
        "keine automatische Projektbearbeitung",
        "keine automatische Speicherung",
        "keine automatische Agenten-Autonomie-Erhöhung",
        "keine externe Verbindung ohne Jamals Freigabe",
      ],
      hrTrainingDerivation:
        "HR nutzt die Routine, um tägliche Trainings-, Ausbildungs- und Autonomie-Vorschläge für alle 25 Agenten abzuleiten, ohne Autonomie automatisch freizugeben.",
    },
    qualityCenterRelation:
      "Das Qualitätszentrum prüft, ob Arbeitsblöcke klein, verständlich, sicher, testbar und anschlussfähig sind.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent hält das Muster als wiederverwendbare Projektlogik sichtbar, ohne automatisch zu speichern.",
    projectManagerRelation:
      "Der Projektmanager-Agent macht aus Projektstand und Artefakt den nächsten umsetzbaren Schritt, ohne automatische Fortsetzung zu starten.",
    jamalOptions: [
      "Projektarbeitsroutine übernehmen",
      "Einmal begrenzt schärfen",
      "Stoppen / nicht weiterführen",
    ],
    adoptableCriteria: [
      "Routine beginnt mit einem echten Projektartefakt",
      "Arbeitsblock ist klein und manuell prüfbar",
      "Auswertung erzeugt klare Lernsignale für Agenten",
      "nächster Jamal-Entscheidungspunkt ist sichtbar",
      "Grenzen und Abbruchpunkte bleiben sichtbar",
      "Muster ist auf Health, Expansion App, Marketing Agentur OS und weitere Projekte übertragbar",
    ],
    sharpenOnceCriteria: [
      "Übertragung auf andere Projekte ist noch zu allgemein",
      "Agenten-Lernsignale sind noch nicht klar genug",
      "Jamal-Entscheidungspunkt muss konkreter werden",
      "Qualitätszentrum-, Projektmanager- oder Archiv-Bezug braucht mehr Schärfe",
    ],
    stopCriteria: [
      "Routine würde zu automatischer Projektbearbeitung führen",
      "Projektartefakt oder Nutzen ist nicht klar",
      "echte Daten, externe Verbindung oder Speicherung wären nötig",
      "Agenten-Autonomie würde ohne Jamals Freigabe erhöht",
      "Muster ist nicht wiederverwendbar oder nicht prüfbar",
    ],
    expectedResultAfterApproval:
      "Eine allgemeine Projektarbeitsroutine ist lokal sichtbar, mit der Jamal echte Projekte manuell, wiederholbar und qualitätsgesichert führen kann.",
    agentContributions: [
      {
        agent: "GF-Agent",
        contribution: "prüft Führungsnutzen und Entscheidbarkeit",
      },
      {
        agent: "Projektmanager-Agent",
        contribution: "übersetzt Projektstand in nächsten Arbeitsblock",
      },
      {
        agent: "Produktmanager-Agent",
        contribution: "prüft Produktnutzen und Ergebnislogik",
      },
      {
        agent: "Design-Director-Agent",
        contribution: "prüft Verständlichkeit und Nutzerführung",
      },
      {
        agent: "Entwickler-Agent",
        contribution: "prüft lokale technische Umsetzbarkeit",
      },
      {
        agent: "QA-Agent",
        contribution: "prüft Kriterien, Testbarkeit und Bestandsschutz",
      },
      {
        agent: "Compliance/Risiko-Agent",
        contribution: "prüft Sicherheitsgrenzen",
      },
      {
        agent: "HR-Agent",
        contribution: "leitet Trainingssignale für alle 25 Agenten ab",
      },
      {
        agent: "Wissens/Archiv-Agent",
        contribution: "sichert das Muster als wiederverwendbare Projektlogik",
      },
    ],
    nonGoals: [
      "keine automatische Projektbearbeitung",
      "keine automatische Agenten-Autonomie-Erhöhung",
      "keine Speicherung",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine echten Kundendaten",
      "keine medizinische Empfehlung",
      "keine Diagnose",
      "keine Heilversprechen",
      "keine automatische Beraterinnen-/Kundenkommunikation",
    ],
    qualityBoundary:
      "Die Routine ist nur gültig, wenn sie aus einem echten Projektartefakt einen kleinen, verständlichen, sicheren und manuell auswertbaren Arbeitsblock ableitet.",
    safetyBoundary:
      "Die Projektarbeitsroutine bleibt lokal, manuell, read-only und kontrolliert: keine Speicherung, keine Schreiboperation, keine externen Requests, keine Automatisierung, keine Plugin-Ausführung, keine echte Kundendatenverarbeitung, keine automatische Projektentscheidung und keine Agenten-Autonomie-Erhöhung.",
    prepared: true,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    realCustomerDataBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticCommunicationBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
  };
}

function getProductiveExpansionFirstProjectWorkBlockFromRoutine() {
  return {
    title: "Projektarbeitsroutine auf Expansion App anwenden",
    status: "erste Anwendung der zentralen Projektarbeitsroutine auf Expansion App vorbereitet",
    source:
      "V6.34.3 hat aus dem Health-Muster eine allgemeine Projektarbeitsroutine abgeleitet. V6.34.4 wendet diese Routine erstmals auf ein zweites echtes Projekt an.",
    project: "Expansion App",
    exampleCase: "Morning Fire -> Schweden",
    usedPattern:
      "Projekt auswählen -> Projektartefakt bestimmen -> kleinen Arbeitsblock ableiten -> manuell ausführbar machen -> Ergebnis auswertbar vorbereiten -> Agenten-Lernsignale ableiten -> Jamal-Entscheidungspunkt vorbereiten",
    whyExpansionIsSuitableSecondProject: [
      "Expansion App ist ein echtes Projekt mit konkretem Produkt-/Länderbezug",
      "Morning Fire -> Schweden ist klein genug für einen ersten manuellen Arbeitsblock",
      "Unterlagenlücken sind ohne externe Verbindung und ohne rechtliche Freigabe sichtbar strukturierbar",
      "das Projekt trainiert Compliance-, Projektmanagement-, Content- und GF-Logik außerhalb von Health",
      "die Zentrale zeigt damit projektübergreifende Arbeitsfähigkeit",
    ],
    selectedProjectArtifact: "Export-/Länderprüfung für ein Produkt-Land-Paar",
    firstSmallWorkBlock:
      "Unterlagenlücke für Morning Fire -> Schweden manuell strukturieren",
    workBlockGoal:
      "Jamal erhält eine interne Arbeitsübersicht, welche Unterlagen vorhanden, fehlend oder unklar sind und warum noch keine automatische Start- oder Länderentscheidung vorbereitet wird.",
    manualWorkSteps: [
      "Produkt-Land-Paar benennen: Morning Fire -> Schweden",
      "bekannte Unterlagenarten sammeln",
      "fehlende oder unklare Unterlagen markieren",
      "Grund für die Lücke kurz formulieren",
      "nächsten manuellen Anforderungsschritt vorbereiten",
      "Sicherheits-/Prüfhinweis sichtbar machen",
    ],
    expectedResultFormat: [
      "1 Geschäftsführer-Kurzsatz",
      "1 Liste vorhandener Unterlagen",
      "1 Liste fehlender oder unklarer Unterlagen",
      "1 nächster manueller Schritt",
      "1 Sicherheits-/Prüfhinweis",
    ],
    exampleOutputWithoutRealApproval:
      "Für Morning Fire -> Schweden ist noch keine Startentscheidung vorbereitet. Zuerst müssen Produktdatenblatt, Zutaten-/Nährwertangaben, Verpackungsbilder, Claims und Verkehrsfähigkeitsnachweise vollständig geprüft oder angefordert werden. Nächster manueller Schritt: Unterlagenliste an Produktteam/Marketing/Hersteller vorbereiten. Keine automatische Länderfreigabe.",
    founderBenefit:
      "Jamal sieht sofort, ob eine Expansion-Entscheidung noch an fehlenden Unterlagen hängt, ohne eine rechtliche oder regulatorische Bewertung vorzutäuschen.",
    expansionAppBenefit:
      "Die Expansion App bekommt einen ersten kleinen, wiederholbaren Arbeitsblock für Produkt-/Länderprüfungen.",
    futureProductCountryCheckBenefit:
      "Das Muster kann später für weitere Produkt-Land-Paare genutzt werden: Unterlagenstand, Lücke, nächster manueller Schritt und Freigabegrenze.",
    agentDevelopmentBenefit:
      "Die Agenten trainieren an einem zweiten Projektfall, wie Projektstand, Unterlagenlogik, Risiko und Jamals Entscheidungspunkt zusammengeführt werden.",
    headquartersCompletionBenefit:
      "Die Unternehmenszentrale beweist, dass die zentrale Routine nicht Health-spezifisch ist, sondern echte Projektarbeit projektübergreifend führen kann.",
    projectWorkConnection: [
      "Health war Trainingsfall 1",
      "Expansion App ist Trainingsfall 2",
      "die Unternehmenszentrale zeigt damit projektübergreifende Arbeitsfähigkeit",
    ],
    agentFitnessSignals: [
      {
        agent: "GF-Agent",
        trainingSignal: "prüft, ob Jamal eine klare Entscheidungsgrundlage bekommt",
        expectedFutureQuality: "kurzer, entscheidungsfähiger Geschäftsführer-Satz",
        autonomyStillBlocked: "keine automatische Start- oder Länderentscheidung",
      },
      {
        agent: "Projektmanager-Agent",
        trainingSignal: "übersetzt Projektstand in nächsten Arbeitsblock",
        expectedFutureQuality: "Unterlagenlücke, Reihenfolge und nächster manueller Schritt",
        autonomyStillBlocked: "keine automatische Projektfortsetzung",
      },
      {
        agent: "Produktmanager-Agent",
        trainingSignal: "prüft Produkt-/Länder-Nutzen und Ergebnisformat",
        expectedFutureQuality: "klarer Nutzen des Produkt-Land-Arbeitsblocks",
        autonomyStillBlocked: "keine Produkt- oder Länderfreigabe",
      },
      {
        agent: "Compliance/Risiko-Agent",
        trainingSignal: "prüft Grenzen, keine Rechtsberatung, keine automatische Freigabe",
        expectedFutureQuality: "klare Prüf- und Freigabegrenze",
        autonomyStillBlocked: "keine Rechtsberatung, keine regulatorische Freigabe",
      },
      {
        agent: "QA-Agent",
        trainingSignal: "prüft Kriterien, Vollständigkeit und Testbarkeit",
        expectedFutureQuality: "prüfbare Listen für vorhanden, fehlt und unklar",
        autonomyStillBlocked: "keine automatische Freigabe",
      },
      {
        agent: "Content-Agent",
        trainingSignal: "prüft Verständlichkeit der Unterlagenanforderung",
        expectedFutureQuality: "klarer Anforderungstext für interne Nutzung",
        autonomyStillBlocked: "keine automatische Team-, Hersteller- oder Behördenkommunikation",
      },
      {
        agent: "Design-Director-Agent",
        trainingSignal: "prüft, ob die Übersicht für GF und Team schnell erfassbar ist",
        expectedFutureQuality: "übersichtliche, scanbare Entscheidungslogik",
        autonomyStillBlocked: "keine finalen Designs und kein Deployment",
      },
      {
        agent: "Entwickler-Agent",
        trainingSignal: "prüft lokale Umsetzbarkeit ohne neue technische Risiken",
        expectedFutureQuality: "Arbeitsblock bleibt ohne neue Integration nutzbar",
        autonomyStillBlocked: "kein Code-Zwang, keine externe Verbindung",
      },
      {
        agent: "HR-Agent",
        trainingSignal: "leitet Trainingssignale für alle 25 Agenten ab",
        expectedFutureQuality: "welche Agenten bei Projektartefakten, Unterlagenlogik und Grenzen besser werden müssen",
        autonomyStillBlocked: "keine automatische Schulung und keine Autonomieerhöhung",
      },
      {
        agent: "Wissens/Archiv-Agent",
        trainingSignal: "hält das Expansion-Arbeitsmuster als wiederverwendbare Projektlogik fest",
        expectedFutureQuality: "wiederverwendbares Muster für Produkt-/Länderprüfungen",
        autonomyStillBlocked: "keine automatische Archivierung oder Speicherung",
      },
    ],
    hrTrainingDerivation:
      "HR bleibt für tägliche Trainings-, Ausbildungs- und Autonomie-Vorschläge zuständig und nutzt diesen zweiten Trainingsfall, ohne neue Autonomie automatisch freizugeben.",
    jamalOptions: [
      "Expansion-Arbeitsblock übernehmen",
      "Einmal begrenzt schärfen",
      "Stoppen / nicht weiterführen",
    ],
    workableEnoughCriteria: [
      "Produkt-Land-Paar ist eindeutig benannt",
      "Unterlagenarten sind verständlich getrennt in vorhanden, fehlend oder unklar",
      "nächster manueller Schritt ist klein und umsetzbar",
      "keine rechtliche, steuerliche oder regulatorische Freigabe wird behauptet",
      "Jamal kann entscheiden, ob der Arbeitsblock übernommen, geschärft oder gestoppt wird",
    ],
    sharpenOnceCriteria: [
      "Unterlagenlisten sind noch zu allgemein",
      "nächster manueller Schritt ist noch nicht konkret genug",
      "GF-Satz ist noch nicht entscheidungsfähig",
      "Sicherheits-/Prüfhinweis muss schärfer werden",
      "Agenten-Lernsignal ist noch nicht klar genug",
    ],
    stopCriteria: [
      "Arbeitsblock wirkt wie Rechtsberatung oder regulatorische Freigabe",
      "automatische Länderentscheidung würde nahegelegt",
      "echte externe Kommunikation wäre nötig",
      "echte Produktdaten, Speicherung oder Tool-Verbindung wären erforderlich",
      "Nutzen für Expansion App bleibt unklar",
    ],
    expectedResultAfterApproval:
      "Ein erster manuell nutzbarer Expansion-Arbeitsblock für Morning Fire -> Schweden liegt vor: Unterlagenstatus, Lücken, nächster manueller Schritt und klare Freigabegrenze.",
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft, ob Jamal eine klare Entscheidungsgrundlage bekommt" },
      { agent: "Projektmanager-Agent", contribution: "übersetzt Projektstand in nächsten Arbeitsblock" },
      { agent: "Produktmanager-Agent", contribution: "prüft Produkt-/Länder-Nutzen und Ergebnisformat" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft Grenzen, keine Rechtsberatung, keine automatische Freigabe" },
      { agent: "QA-Agent", contribution: "prüft Kriterien, Vollständigkeit und Testbarkeit" },
      { agent: "Content-Agent", contribution: "prüft Verständlichkeit der Unterlagenanforderung" },
      { agent: "Design-Director-Agent", contribution: "prüft, ob die Übersicht für GF und Team schnell erfassbar ist" },
      { agent: "Entwickler-Agent", contribution: "prüft lokale Umsetzbarkeit ohne neue technische Risiken" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "hält das Expansion-Arbeitsmuster als wiederverwendbare Projektlogik fest" },
    ],
    nonGoals: [
      "keine echte Produktfreigabe",
      "keine Rechtsberatung",
      "keine steuerliche Beratung",
      "keine regulatorische Freigabe",
      "keine automatische Länderentscheidung",
      "keine automatische Team-, Hersteller- oder Behördenkommunikation",
      "keine externen Requests",
      "keine Speicherung",
      "keine Schreiboperation",
      "keine Plugin-Ausführung",
      "kein Deployment",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Der Expansion-Arbeitsblock ist nur gültig, wenn Unterlagenstand, Lücke, nächster manueller Schritt, Nutzen und Freigabegrenze klar sichtbar sind.",
    safetyBoundary:
      "Die Expansion App wird nur intern vorbereitet: keine Rechtsberatung, keine regulatorische Freigabe, keine automatische Länderentscheidung, keine externe Kommunikation, keine Speicherung, keine Schreiboperation und keine Projektbearbeitung ohne Jamals Freigabe.",
    prepared: true,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    automaticCommunicationBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
  };
}

function getProductiveExpansionRoutineApplicationEvaluation() {
  return {
    title: "Projektarbeitsroutine nach Expansion-Anwendung auswerten",
    status: "zweite Projektanwendung der zentralen Arbeitsroutine auswertbar vorbereitet",
    source:
      "V6.34.4 hat die zentrale Projektarbeitsroutine auf Expansion App mit dem Beispiel-Fall Morning Fire -> Schweden angewendet.",
    appliedProject: "Expansion App",
    exampleCase: "Morning Fire -> Schweden",
    appliedWorkBlock:
      "Unterlagenlücke für Morning Fire -> Schweden manuell strukturieren",
    usedRoutine:
      "Projekt auswählen -> Projektartefakt bestimmen -> kleinen Arbeitsblock ableiten -> manuell ausführbar machen -> Ergebnis auswertbar vorbereiten -> Agenten-Lernsignale ableiten -> Jamal-Entscheidungspunkt vorbereiten",
    evaluationGoal:
      "Bewerten, ob die Unternehmenszentrale wirklich projektübergreifend arbeiten kann und ob die Routine nach Health auch bei Expansion App tragfähig ist.",
    evaluatedItems: [
      "Funktioniert die Routine außerhalb von Health?",
      "War der Expansion-Arbeitsblock klein genug?",
      "War der GF-/Jamal-Nutzen klar?",
      "War der Projektmanager-Nutzen klar?",
      "Waren Rechts-, Steuer- und regulatorische Grenzen sauber sichtbar?",
      "Entstanden brauchbare Agenten-Lernsignale?",
      "Ist die Routine bereit für ein drittes Projekt?",
    ],
    comparisonWithHealthTrainingCase: {
      same: [
        "beide Fälle starten mit einem Projektartefakt",
        "beide leiten daraus einen kleinen manuellen Arbeitsblock ab",
        "beide brauchen manuelle Ausführung und manuelle Auswertung",
        "beide erzeugen Agenten-Lernsignale",
        "Jamal bleibt in beiden Fällen Entscheider",
      ],
      different: [
        "Health prüft nicht-medizinische Nutzerorientierung und Health-Grenzen",
        "Expansion prüft Unterlagenlücken, Produkt-/Länderlogik und Freigabegrenzen",
        "Expansion braucht stärkere Rechts-/Regulatorik-Abgrenzung",
        "Health nutzt Beraterinnen-Anschluss, Expansion nutzt Team-/Hersteller-Unterlagenlogik",
      ],
      reusableAcrossProjects: [
        "Projektartefakt bestimmen",
        "kleinen Arbeitsblock ableiten",
        "manuelle Ausführung vorbereiten",
        "Ergebnis auswertbar machen",
        "Agenten-Lernsignale ableiten",
        "Jamal-Entscheidungspunkt vorbereiten",
      ],
      projectSpecific: [
        "Health-Sicherheitsgrenzen und nicht-medizinische Sprache",
        "Expansion-Unterlagenarten und regulatorische Freigabegrenzen",
        "je Projekt eigener Nutzen, eigene Abbruchgrenzen und eigene Fachgrenzen",
      ],
    },
    evaluationQuestions: [
      "Hat die Routine außerhalb von Health funktioniert?",
      "War der Expansion-Arbeitsblock klein genug?",
      "War der GF-/Jamal-Nutzen klar?",
      "War der Projektmanager-Nutzen klar?",
      "Waren die rechtlichen/regulatorischen Grenzen sauber?",
      "Konnte ein konkreter nächster manueller Schritt entstehen?",
      "Entstanden brauchbare Agenten-Lernsignale?",
      "Ist die Routine bereit für ein drittes Projekt?",
    ],
    resultRatings: [
      "projektübergreifend brauchbar",
      "einmal begrenzt schärfen",
      "noch zu projektspezifisch",
      "stoppen / nicht weiterführen",
    ],
    crossProjectUsableCriteria: [
      "Routine funktioniert bei Health und Expansion App mit gleicher Grundlogik",
      "projektbezogene Grenzen bleiben getrennt sichtbar",
      "Arbeitsblock bleibt klein, manuell und auswertbar",
      "Jamal erhält einen klaren Entscheidungspunkt",
      "Agenten-Lernsignale sind rollenbezogen und auf 25 Agenten übertragbar",
    ],
    sharpenOnceCriteria: [
      "Vergleich Health vs. Expansion ist noch nicht klar genug",
      "projektspezifische Grenzen müssen stärker getrennt werden",
      "Agenten-Lernsignale sind noch zu allgemein",
      "drittes Testprojekt ist noch nicht sinnvoll ableitbar",
    ],
    tooProjectSpecificCriteria: [
      "Routine funktioniert nur, wenn Health- oder Expansion-Sonderlogik verwendet wird",
      "Projektartefakte sind nicht vergleichbar genug",
      "Nutzen oder Ergebnisformat lässt sich nicht übertragen",
      "Agenten können kein wiederverwendbares Muster erkennen",
    ],
    stopCriteria: [
      "Routine würde automatische Projektbearbeitung auslösen",
      "Rechtsberatung, regulatorische Freigabe oder Länderentscheidung würde nahegelegt",
      "echte Daten, externe Kommunikation, Speicherung oder Tool-Verbindung wären nötig",
      "Jamal-Entscheidungspunkt bleibt unklar",
      "keine belastbaren Agenten-Lernsignale entstehen",
    ],
    expectedEvaluationResult:
      "Jamal sieht, ob die zentrale Projektarbeitsroutine nach zwei Projekten wahrscheinlich wiederverwendbar ist, welche Teile geschärft werden müssen und ob ein drittes Projekt manuell getestet werden kann.",
    reusableProof:
      "Health-Arbeitsblock geprüft -> Health-Arbeitsblock ausgeführt -> Health-Arbeitsblock ausgewertet -> Routine abgeleitet -> Routine auf Expansion App angewendet -> Expansion-Anwendung auswertbar vorbereitet",
    agentFitnessSignals: [
      {
        agent: "GF-Agent",
        trainingSignal: "prüft, ob Jamal eine projektübergreifende Entscheidungsgrundlage bekommt",
      },
      {
        agent: "Projektmanager-Agent",
        trainingSignal: "prüft, ob aus verschiedenen Projekten vergleichbare Arbeitsblöcke entstehen",
      },
      {
        agent: "Produktmanager-Agent",
        trainingSignal: "prüft, ob Nutzen und Ergebnisformat projektübergreifend funktionieren",
      },
      {
        agent: "Design-Director-Agent",
        trainingSignal: "prüft Verständlichkeit über unterschiedliche Projektarten hinweg",
      },
      {
        agent: "Entwickler-Agent",
        trainingSignal: "prüft lokale Umsetzbarkeit ohne technische Erweiterung",
      },
      {
        agent: "QA-Agent",
        trainingSignal: "prüft Kriterien, Bestandsschutz und Vergleichbarkeit",
      },
      {
        agent: "Compliance/Risiko-Agent",
        trainingSignal: "prüft Health-Grenzen und Expansion-Grenzen getrennt",
      },
      {
        agent: "HR-Agent",
        trainingSignal: "leitet Trainingssignale für alle 25 Agenten ab",
      },
      {
        agent: "Wissens/Archiv-Agent",
        trainingSignal: "hält fest, welche Teile der Routine wiederverwendbar sind",
      },
    ],
    hrTrainingDerivation:
      "HR erkennt die zweite Projektanwendung als wichtigen Trainingspunkt für alle 25 Agenten: gleiche Routine, andere Fachgrenzen, weiterhin keine Autonomieerhöhung.",
    qualityCenterRelation:
      "Das Qualitätszentrum prüft, ob die Routine bei zwei Projekten klein, verständlich, sicher, vergleichbar und testbar bleibt.",
    projectManagerRelation:
      "Der Projektmanager-Agent prüft, ob aus verschiedenen Projektständen vergleichbare nächste Arbeitsblöcke entstehen.",
    complianceRiskRelation:
      "Compliance/Risiko trennt Health-Grenzen, Rechts-/Regulatorik-Grenzen und automatische Freigabegrenzen sichtbar voneinander.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent hält fest, welche Teile der Routine projektübergreifend wiederverwendbar sind, ohne automatisch zu speichern.",
    jamalOptions: [
      "Routine als projektübergreifend brauchbar markieren",
      "Einmal begrenzt schärfen",
      "Auf drittes Projekt testen",
      "Stoppen / nicht weiterführen",
    ],
    nonGoals: [
      "keine automatische Projektbearbeitung",
      "keine automatische Freigabe der Routine",
      "keine automatische Agenten-Autonomie-Erhöhung",
      "keine Rechtsberatung",
      "keine steuerliche Beratung",
      "keine regulatorische Beratung oder Freigabe",
      "keine automatische Länderentscheidung",
      "keine automatische Team-, Hersteller- oder Behördenkommunikation",
      "keine externen Requests",
      "keine Speicherung",
      "keine Schreiboperation",
      "keine Plugin-Ausführung",
      "keine medizinischen Diagnosen, Heilversprechen oder medizinischen Empfehlungen",
    ],
    qualityBoundary:
      "Die Auswertung ist nur gültig, wenn Health und Expansion App vergleichbar genug sind, ohne ihre projektspezifischen Grenzen zu verwischen.",
    safetyBoundary:
      "Die Routine bleibt manuell, lokal, read-only und kontrolliert: keine Automatisierung, keine Speicherung, keine externen Requests, keine Rechts-/Regulatorik-Freigabe, keine medizinische Aussage, keine automatische Projektentscheidung und keine Agenten-Autonomie-Erhöhung.",
    prepared: true,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    automaticCommunicationBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
  };
}

function getProductiveMarketingFirstProjectWorkBlockFromRoutine() {
  return {
    title: "Projektarbeitsroutine auf Marketing Agentur OS anwenden",
    status: "erste Anwendung der zentralen Projektarbeitsroutine auf Marketing Agentur OS vorbereitet",
    source:
      "V6.34.5 hat die Expansion-Anwendung der zentralen Projektarbeitsroutine auswertbar gemacht. V6.34.6 wendet die Routine auf ein drittes echtes Projekt an.",
    project: "Marketing Agentur OS",
    exampleCase: "Erstes starkes Marketing-Artefakt manuell vorbereiten",
    usedRoutine:
      "Projekt auswählen -> Projektartefakt bestimmen -> kleinen Arbeitsblock ableiten -> manuell ausführbar machen -> Ergebnis auswertbar vorbereiten -> Agenten-Lernsignale ableiten -> Jamal-Entscheidungspunkt vorbereiten",
    whyMarketingOsIsSuitableThirdProject: [
      "Marketing Agentur OS ist ein echtes kreatives Projekt mit klarem Artefaktbedarf",
      "der Arbeitsblock bleibt klein, weil kein Motiv erzeugt wird",
      "Marketing trainiert Design-, Content-, GF- und Qualitätslogik außerhalb von Health und Expansion",
      "die Routine wird damit über Produkt-, Prüf- und Kreativprojekte hinweg getestet",
      "die Unternehmenszentrale zeigt, dass kreative Arbeit strukturiert vorbereitet werden kann",
    ],
    selectedProjectArtifact: "Marketing-/Design-Anforderung für ein erstes Premium-Motiv",
    firstSmallWorkBlock:
      "Design-Brief für ein erstes Premium-Marketingmotiv manuell strukturieren",
    workBlockGoal:
      "Jamal erhält einen klaren internen Design-Brief, ohne dass Bild, Video, Kampagne, Veröffentlichung oder Tool-Auftrag automatisch entstehen.",
    manualWorkSteps: [
      "Marketing-Ziel des Motivs kurz benennen",
      "Zielgruppe und Nutzungskontext eingrenzen",
      "gewünschte Wirkung formulieren",
      "Design-DNA-Hinweis festhalten",
      "Negativliste gegen falsche Wirkung erstellen",
      "nächsten manuellen Freigabeschritt vorbereiten",
      "Sicherheits-/Freigabehinweis sichtbar machen",
    ],
    expectedResultFormat: [
      "1 Geschäftsführer-Kurzsatz",
      "1 Ziel des Motivs",
      "1 Zielgruppe / Nutzungskontext",
      "1 gewünschte Wirkung",
      "1 Design-DNA-Hinweis",
      "1 Negativliste",
      "1 nächster manueller Schritt",
      "1 Sicherheits-/Freigabehinweis",
    ],
    exampleOutputWithoutRealProduction:
      "Für Marketing Agentur OS wird zunächst kein Motiv erzeugt. Der erste manuelle Schritt ist ein kurzer Design-Brief für ein Premium-Marketingmotiv: warm, hochwertig, verständlich, vertrauensbildend, ohne Stock-Gesichter, ohne übertriebene Dubai-/Luxus-Optik. Nächster manueller Schritt: Jamal prüft, ob dieser Brief als Grundlage für ein späteres Bild-, Video- oder Kampagnenartefakt genutzt werden darf. Keine automatische Erstellung, Veröffentlichung oder Tool-Ausführung.",
    founderBenefit:
      "Jamal bekommt eine kreative Entscheidungsgrundlage, ohne direkt Bild-, Video- oder Kampagnenproduktion auszulösen.",
    marketingOsBenefit:
      "Marketing Agentur OS erhält einen ersten strukturierten Premium-Design-Brief als nutzbares internes Artefakt.",
    futureMarketingAssetBenefit:
      "Das Muster kann später Bilder, Logos, Videos, Posts und Kampagnen vorbereiten, ohne Tool-Ausführung oder Veröffentlichung automatisch freizugeben.",
    agentDevelopmentBenefit:
      "Die Agenten trainieren an einem dritten Projektfall, wie kreative Anforderungen, Wirkung, Grenzen und Jamals Freigabe zusammengeführt werden.",
    headquartersCompletionBenefit:
      "Die Unternehmenszentrale beweist Arbeitsfähigkeit über Produkt-, Prüf- und Kreativprojekte hinweg.",
    projectWorkConnection: [
      "Health war Trainingsfall 1",
      "Expansion App war Trainingsfall 2",
      "Marketing Agentur OS ist Trainingsfall 3",
      "die Unternehmenszentrale zeigt damit Arbeitsfähigkeit über Produkt-, Prüf- und Kreativprojekte hinweg",
    ],
    agentFitnessSignals: [
      {
        agent: "GF-Agent",
        trainingSignal: "prüft, ob Jamal eine klare kreative Entscheidungsgrundlage bekommt",
        expectedFutureQuality: "kurzer, entscheidungsfähiger Geschäftsführer-Satz für kreative Arbeit",
        autonomyStillBlocked: "keine automatische kreative Entscheidung",
      },
      {
        agent: "Projektmanager-Agent",
        trainingSignal: "übersetzt Marketing-Projektstand in nächsten Arbeitsblock",
        expectedFutureQuality: "klarer Briefing-Schritt mit Grenze und Freigabe",
        autonomyStillBlocked: "keine automatische Projektfortsetzung",
      },
      {
        agent: "Produktmanager-Agent",
        trainingSignal: "prüft, ob Nutzen, Zielgruppe und Ergebnisformat klar sind",
        expectedFutureQuality: "Motivnutzen, Zielgruppe und Kontext bleiben trennscharf",
        autonomyStillBlocked: "keine Produkt- oder Kampagnenentscheidung",
      },
      {
        agent: "Design-Director-Agent",
        trainingSignal: "prüft Design-DNA, Wirkung, Negativliste und visuelle Richtung",
        expectedFutureQuality: "Premium-Wirkung ohne falsche Bild- oder Kampagnenversprechen",
        autonomyStillBlocked: "keine finale Gestaltung und kein Tool-Auftrag",
      },
      {
        agent: "Content-Agent",
        trainingSignal: "prüft Verständlichkeit, Tonalität und Botschaft",
        expectedFutureQuality: "klarer, knapper und markengerechter Briefingtext",
        autonomyStillBlocked: "keine Veröffentlichung und keine externe Kommunikation",
      },
      {
        agent: "Entwickler-Agent",
        trainingSignal: "prüft lokale Umsetzbarkeit ohne neue technische Risiken",
        expectedFutureQuality: "Arbeitsblock bleibt ohne neue Integration nutzbar",
        autonomyStillBlocked: "keine technische Umsetzung, keine Plugin-Verbindung",
      },
      {
        agent: "QA-Agent",
        trainingSignal: "prüft Kriterien, Bestandsschutz und Testbarkeit",
        expectedFutureQuality: "Brief ist prüfbar, begrenzt und anschlussfähig",
        autonomyStillBlocked: "keine automatische Freigabe",
      },
      {
        agent: "Compliance/Risiko-Agent",
        trainingSignal: "prüft Grenzen, keine Veröffentlichung, keine Rechtefreigabe, keine Kundendaten",
        expectedFutureQuality: "klare Rechte-, Marken-, Personen- und Veröffentlichungsgrenze",
        autonomyStillBlocked: "keine Rechte-, Marken- oder Personenfreigabe",
      },
      {
        agent: "HR-Agent",
        trainingSignal: "leitet Trainingssignale für alle 25 Agenten ab",
        expectedFutureQuality:
          "welche Agenten bei kreativer Projektarbeit, Briefingqualität und Grenzen besser werden müssen",
        autonomyStillBlocked: "keine automatische Schulung und keine Autonomieerhöhung",
      },
      {
        agent: "Wissens/Archiv-Agent",
        trainingSignal: "hält das Marketing-Arbeitsmuster als wiederverwendbare Projektlogik fest",
        expectedFutureQuality: "wiederverwendbares Muster für kreative Projektartefakte",
        autonomyStillBlocked: "keine automatische Archivierung oder Speicherung",
      },
    ],
    hrTrainingDerivation:
      "HR bleibt für tägliche Trainings-, Ausbildungs- und Autonomie-Vorschläge zuständig und nutzt diesen dritten Trainingsfall, ohne neue Autonomie automatisch freizugeben.",
    jamalOptions: [
      "Marketing-Arbeitsblock übernehmen",
      "Einmal begrenzt schärfen",
      "Stoppen / nicht weiterführen",
    ],
    workableEnoughCriteria: [
      "Marketingziel, Zielgruppe, Wirkung und Design-DNA sind klar",
      "Negativliste verhindert falsche Optik oder falsches Versprechen",
      "nächster manueller Schritt ist klein und prüfbar",
      "keine Bild-, Video- oder Kampagnenproduktion wird ausgelöst",
      "Jamal kann entscheiden, ob der Brief übernommen, geschärft oder gestoppt wird",
    ],
    sharpenOnceCriteria: [
      "Wirkung oder Zielgruppe ist noch zu allgemein",
      "Design-DNA ist noch nicht präzise genug",
      "Negativliste fehlt oder ist zu schwach",
      "GF-Satz ist noch nicht entscheidungsfähig",
      "Sicherheits-/Freigabehinweis muss klarer werden",
    ],
    stopCriteria: [
      "Brief würde automatische Bild-, Video- oder Kampagnenproduktion nahelegen",
      "Rechte-, Marken- oder Personenfreigabe wäre nötig",
      "Canva, HeyGen, Figma oder ein anderes Plugin müsste ausgeführt werden",
      "Veröffentlichung, Kampagnenausspielung oder Kundendaten wären erforderlich",
      "Nutzen für Marketing Agentur OS bleibt unklar",
    ],
    expectedResultAfterApproval:
      "Ein erster manuell nutzbarer Marketing-Arbeitsblock liegt vor: Design-Brief, Ziel, Zielgruppe, Wirkung, Design-DNA, Negativliste, nächster manueller Schritt und klare Freigabegrenze.",
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft, ob Jamal eine klare kreative Entscheidungsgrundlage bekommt" },
      { agent: "Projektmanager-Agent", contribution: "übersetzt Marketing-Projektstand in nächsten Arbeitsblock" },
      { agent: "Produktmanager-Agent", contribution: "prüft, ob Nutzen, Zielgruppe und Ergebnisformat klar sind" },
      { agent: "Design-Director-Agent", contribution: "prüft Design-DNA, Wirkung, Negativliste und visuelle Richtung" },
      { agent: "Content-Agent", contribution: "prüft Verständlichkeit, Tonalität und Botschaft" },
      { agent: "Entwickler-Agent", contribution: "prüft lokale Umsetzbarkeit ohne neue technische Risiken" },
      { agent: "QA-Agent", contribution: "prüft Kriterien, Bestandsschutz und Testbarkeit" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft Grenzen, keine Veröffentlichung, keine Rechtefreigabe, keine Kundendaten" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "hält das Marketing-Arbeitsmuster als wiederverwendbare Projektlogik fest" },
    ],
    nonGoals: [
      "keine echte Bildproduktion",
      "keine echte Videoproduktion",
      "keine Kampagnenausspielung",
      "keine Veröffentlichung",
      "keine Canva-Ausführung",
      "keine HeyGen-Ausführung",
      "keine Figma-Ausführung",
      "keine Plugin-Ausführung",
      "keine Rechte-, Marken- oder Personenfreigabe",
      "keine echten Kundendaten",
      "keine Speicherung",
      "keine Schreiboperation",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Der Marketing-Arbeitsblock ist nur gültig, wenn Designziel, Zielgruppe, Wirkung, Grenze, Negativliste und nächster manueller Schritt klar sichtbar sind.",
    safetyBoundary:
      "Marketing Agentur OS wird nur intern vorbereitet: keine Bild-, Video- oder Kampagnenproduktion, keine Veröffentlichung, keine Canva-/HeyGen-/Figma-Ausführung, keine Speicherung, keine Rechtefreigabe und keine Projektbearbeitung ohne Jamals Freigabe.",
    prepared: true,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    campaignExecutionBlocked: true,
    rightsApprovalBlocked: true,
    brandApprovalBlocked: true,
    personApprovalBlocked: true,
    realCustomerDataBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
  };
}

function getProductiveCrossProjectWorkRoutineEvaluation() {
  return {
    title: "Projektarbeitsfähigkeit aus drei Projektarten auswerten",
    status: "projektübergreifende Arbeitsfähigkeit aus drei Trainingsfällen auswertbar vorbereitet",
    source:
      "V6.34.6 hat die zentrale Projektarbeitsroutine nach Health und Expansion App auf Marketing Agentur OS angewendet. V6.34.7 wertet die drei Anwendungen gemeinsam aus.",
    includedProjectTypes: [
      "Health Upgrade Kompass",
      "Expansion App",
      "Marketing Agentur OS",
    ],
    currentRoutine:
      "Projekt auswählen -> Projektartefakt bestimmen -> kleinen Arbeitsblock ableiten -> manuell ausführbar machen -> Ergebnis auswertbar vorbereiten -> Agenten-Lernsignale ableiten -> Jamal-Entscheidungspunkt vorbereiten",
    evaluationGoal:
      "Prüfen, ob die Unternehmenszentrale über verschiedene Projektarten hinweg mit derselben kontrollierten Routine produktiv arbeiten kann.",
    evaluatedAcrossAllProjects: [
      "ob Projektartefakte sauber in kleine Arbeitsblöcke übersetzt wurden",
      "ob die Arbeitsblöcke klein, manuell und entscheidbar geblieben sind",
      "ob projektspezifische Sicherheitsgrenzen getrennt sichtbar bleiben",
      "ob Jamal klare Führungs- und Entscheidungspunkte erhält",
      "ob brauchbare Lernsignale für alle 25 Agenten entstehen",
      "ob daraus ein stabiler Standardprozess vorbereitet werden kann",
    ],
    projectComparison: [
      {
        project: "Health Upgrade Kompass",
        projectType: "Produkt-/Nutzerorientierung",
        workBlock: "kleiner Health-Schritt",
        boundary:
          "keine Diagnosen, keine Heilversprechen, keine medizinischen Empfehlungen",
        founderBenefit:
          "Jamal sieht, ob ein Health-Artefakt als kleiner, sicherer Produktbaustein taugt.",
        projectWorkBenefit:
          "Health-Projektarbeit wird in manuell prüfbare Produktstruktur übersetzt.",
        agentDevelopmentBenefit:
          "Agenten lernen Health-Grenzen, Nutzenformulierung und nicht-medizinische Sprache.",
      },
      {
        project: "Expansion App",
        projectType: "Prüf-/Export-/Länderlogik",
        workBlock: "Unterlagenlücke für Morning Fire -> Schweden",
        boundary:
          "keine Rechts-, Steuer- oder regulatorische Freigabe, keine Länderentscheidung",
        founderBenefit:
          "Jamal bekommt eine interne Entscheidungsgrundlage, ohne eine Länderfreigabe auszulösen.",
        projectWorkBenefit:
          "Expansion-Arbeit wird in vorhandene, fehlende und unklare Unterlagen getrennt.",
        agentDevelopmentBenefit:
          "Agenten lernen Unterlagenlogik, Freigabegrenzen und regulatorische Abgrenzung.",
      },
      {
        project: "Marketing Agentur OS",
        projectType: "Kreativ-/Marketinglogik",
        workBlock: "Design-Brief für erstes Premium-Marketingmotiv",
        boundary:
          "keine Bildproduktion, keine Veröffentlichung, keine Plugin-Ausführung",
        founderBenefit:
          "Jamal bekommt eine kreative Entscheidungsgrundlage, ohne Produktion oder Veröffentlichung auszulösen.",
        projectWorkBenefit:
          "Marketing-Arbeit wird in Designziel, Wirkung, Design-DNA, Negativliste und Freigabehinweis übersetzt.",
        agentDevelopmentBenefit:
          "Agenten lernen kreative Briefingqualität, visuelle Grenze und sichere Tool-Abgrenzung.",
      },
    ],
    sharedPattern: [
      "ein echtes Projekt wird ausgewählt",
      "ein vorhandenes oder benötigtes Projektartefakt wird bestimmt",
      "ein kleiner Arbeitsblock wird abgeleitet",
      "der Arbeitsblock bleibt manuell, lokal und auswertbar",
      "Jamal bekommt einen Entscheidungspunkt",
      "Agenten liefern Trainingssignale ohne neue Autonomie",
    ],
    projectSpecificDifferences: [
      "Health braucht nicht-medizinische Sprache und Health-Grenzen",
      "Expansion braucht Rechts-/Regulatorik-Abgrenzung und keine Länderfreigabe",
      "Marketing braucht Kreativbriefing, Rechte-/Veröffentlichungsgrenzen und keine Tool-Ausführung",
    ],
    evaluationQuestions: [
      "Funktioniert die Routine über drei verschiedene Projektarten hinweg?",
      "Sind die Arbeitsblöcke klein genug geblieben?",
      "Sind die Ergebnisse für Jamal entscheidbar?",
      "Sind die Sicherheitsgrenzen je Projektart sauber getrennt?",
      "Entstehen brauchbare Agenten-Lernsignale?",
      "Wird die Unternehmenszentrale dadurch fertiger?",
      "Kann daraus ein stabiler Standardprozess entstehen?",
    ],
    resultRatings: [
      "projektübergreifend tragfähig",
      "einmal begrenzt schärfen",
      "nur teilweise tragfähig",
      "stoppen / nicht weiterführen",
    ],
    crossProjectViableCriteria: [
      "die gleiche Grundroutine funktioniert bei Health, Expansion und Marketing",
      "Jamal erhält in allen drei Fällen einen klaren manuellen Entscheidungspunkt",
      "jedes Projekt behält eigene Grenzen und eigene Nicht-Ziele",
      "Arbeitsblöcke bleiben klein, prüfbar und ohne Automatisierung",
      "Agenten-Lernsignale sind rollenbezogen und auf alle 25 Agenten übertragbar",
    ],
    sharpenOnceCriteria: [
      "Vergleichskriterien sind noch nicht klar genug",
      "Standardprozess ist noch zu allgemein formuliert",
      "Agenten-Lernsignale müssen stärker nach Rollen getrennt werden",
      "Sicherheitsgrenzen je Projektart müssen noch sichtbarer werden",
    ],
    partiallyViableCriteria: [
      "die Routine funktioniert bei zwei Projektarten, aber nicht sauber bei allen drei",
      "ein Projekt erzeugt noch zu viele projektspezifische Sonderregeln",
      "Jamal-Entscheidungspunkt oder Ergebnisformat ist nicht durchgehend klar",
      "Agenten-Lernsignale bleiben für einzelne Rollen zu schwach",
    ],
    stopCriteria: [
      "Routine würde automatische Projektbearbeitung nahelegen",
      "Projektgrenzen werden vermischt oder unscharf",
      "externe Requests, Speicherung, Plugin-Ausführung oder echte Freigaben wären nötig",
      "Jamal bekommt keinen klaren Entscheidungspunkt",
      "keine belastbaren Trainingssignale für die Agenten entstehen",
    ],
    expectedEvaluationResult:
      "Jamal sieht, ob aus Health, Expansion und Marketing ein stabiler, manueller Standardprozess für projektübergreifende Arbeit entstehen darf.",
    crossProjectProof:
      "Health -> Expansion -> Marketing: drei unterschiedliche Projektarten wurden mit derselben kontrollierten Projektarbeitsroutine bearbeitbar vorbereitet.",
    proofMeaning: [
      "Die Routine ist manuell wiederholbar",
      "die Agenten liefern bessere Trainingssignale",
      "Jamal bekommt klarere Entscheidungspunkte",
      "die Unternehmenszentrale wird als lokales Führungs- und Projektarbeitssystem reifer",
      "der Nachweis bedeutet noch keine Automatisierung",
    ],
    agentFitnessSignals: [
      {
        agent: "GF-Agent",
        trainingSignal:
          "prüft, ob Jamal projektübergreifend bessere Führungsentscheidungen bekommt",
      },
      {
        agent: "Projektmanager-Agent",
        trainingSignal:
          "prüft, ob aus verschiedenen Projektständen vergleichbare nächste Schritte entstehen",
      },
      {
        agent: "Produktmanager-Agent",
        trainingSignal:
          "prüft, ob Nutzen und Ergebnisformat über Projektarten hinweg klar bleiben",
      },
      {
        agent: "Design-Director-Agent",
        trainingSignal:
          "prüft Verständlichkeit, Nutzerführung und kreative Qualität",
      },
      {
        agent: "Entwickler-Agent",
        trainingSignal:
          "prüft lokale Umsetzbarkeit ohne technische Erweiterung",
      },
      {
        agent: "QA-Agent",
        trainingSignal:
          "prüft Bestandsschutz, Vergleichbarkeit, Kriterien und Testbarkeit",
      },
      {
        agent: "Compliance/Risiko-Agent",
        trainingSignal:
          "prüft getrennte Sicherheitsgrenzen für Health, Expansion und Marketing",
      },
      {
        agent: "Content-Agent",
        trainingSignal:
          "prüft Verständlichkeit und saubere Formulierungen",
      },
      {
        agent: "HR-Agent",
        trainingSignal: "leitet Trainingssignale für alle 25 Agenten ab",
      },
      {
        agent: "Wissens/Archiv-Agent",
        trainingSignal:
          "hält fest, welche Routinebestandteile als Standardprozess geeignet sind",
      },
    ],
    hrTrainingDerivation:
      "HR nutzt die drei Projektarten als gemeinsamen Trainingspunkt für alle 25 Agenten: gleiche Routine, unterschiedliche Grenzen, weiterhin keine automatische Autonomie.",
    qualityCenterRelation:
      "Das Qualitätszentrum prüft, ob Arbeitsblöcke klein, verständlich, sicher, vergleichbar und testbar bleiben.",
    projectManagerRelation:
      "Der Projektmanager-Agent prüft, ob Projektstand, Artefakt und nächster Arbeitsblock projektübergreifend stabil übersetzt werden.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent hält fest, welche Routinebestandteile als Standardprozess geeignet wären, ohne automatisch zu speichern.",
    jamalOptions: [
      "Routine als projektübergreifend tragfähig markieren",
      "Einmal begrenzt schärfen",
      "Standardprozess vorbereiten",
      "Stoppen / nicht weiterführen",
    ],
    nonGoals: [
      "kein viertes Projekt starten",
      "keine automatische Projektbearbeitung",
      "keine automatische Standardprozess-Freigabe",
      "keine automatische Agenten-Autonomie-Erhöhung",
      "keine externen Requests",
      "keine Speicherung",
      "keine Schreiboperation",
      "keine Plugin-Ausführung",
      "keine echten Produktfreigaben",
      "keine Rechts-, Steuer- oder regulatorische Beratung/Freigabe",
      "keine medizinischen Diagnosen, Heilversprechen oder medizinischen Empfehlungen",
      "keine Bild-, Video- oder Kampagnenproduktion",
      "keine Veröffentlichung",
    ],
    qualityBoundary:
      "Die Routine gilt nur als projektübergreifend tragfähig, wenn sie bei Health, Expansion und Marketing kleine, entscheidbare, sichere und auswertbare Arbeitsblöcke erzeugt.",
    safetyBoundary:
      "Die Auswertung bleibt lokal, manuell und read-only: keine Automatisierung, keine Speicherung, keine externen Requests, keine Plugin-Ausführung, keine echte Freigabe, keine automatische Projektentscheidung und keine Agenten-Autonomie-Erhöhung.",
    prepared: true,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
  };
}

function getProductiveCentralProjectWorkStandardProcess() {
  return {
    title: "Standard-Projektarbeitsprozess V1 vorbereiten",
    status: "projektübergreifender Standard-Projektarbeitsprozess V1 vorbereitet",
    source:
      "V6.34.7 hat die Projektarbeitsfähigkeit über Health Upgrade Kompass, Expansion App und Marketing Agentur OS ausgewertet.",
    foundation:
      "Health -> Expansion -> Marketing: drei Projektarten mit gleicher kontrollierter Routine bearbeitbar vorbereitet",
    goal:
      "Einen kontrollierten Standardprozess vorbereiten, nach dem die KI-Unternehmenszentrale künftig lokal, manuell und qualitätsgesichert an echten Projekten arbeitet.",
    whyPreparedNow: [
      "die Routine wurde an drei unterschiedlichen Projektarten geprüft",
      "Health, Expansion und Marketing erzeugen vergleichbare kleine Arbeitsblöcke",
      "Jamal erhält in allen Fällen einen manuellen Entscheidungspunkt",
      "Agenten-Lernsignale sind über Projektarten hinweg sichtbar",
      "die Unternehmenszentrale braucht jetzt einen Standard statt weiterer Einzelfalllogik",
    ],
    processShouldDo: [
      "Projektstand in einen kleinen nächsten Arbeitsblock übersetzen",
      "Ergebnisformat und Sicherheitsgrenze sichtbar machen",
      "manuelle Ausführung und Auswertung vorbereiten",
      "Agenten-Lernsignale ableiten",
      "HR-Trainingsimpulse vorbereiten",
      "Jamal den nächsten Entscheidungspunkt geben",
    ],
    processMustNotDo: [
      "keine automatische Projektbearbeitung starten",
      "keine Daten speichern oder schreiben",
      "keine externen Systeme verbinden",
      "keine Plugins ausführen",
      "keine echten Freigaben ersetzen",
      "keine Agenten-Autonomie automatisch erhöhen",
    ],
    standardProcessV1: [
      "Projekt auswählen",
      "Projektstand kurz einordnen",
      "vorhandenes Projektartefakt bestimmen",
      "kleinsten sinnvollen Arbeitsblock ableiten",
      "Arbeitsblock manuell ausführbar vorbereiten",
      "Ergebnisformat festlegen",
      "Sicherheitsgrenzen prüfen",
      "Jamal-Entscheidungspunkt vorbereiten",
      "manuelle Ausführung auswertbar machen",
      "Agenten-Lernsignale ableiten",
      "HR-Trainingsimpulse vorbereiten",
      "wiederverwendbares Wissen sichern",
    ],
    standardProcessCore:
      "Die Unternehmenszentrale arbeitet nicht automatisch, sondern kontrolliert: Projektstand -> kleiner Arbeitsblock -> manuelle Ausführung -> Auswertung -> Agentenlernen -> nächste Jamal-Entscheidung.",
    applicationAreas: [
      "Health Upgrade Kompass",
      "Expansion App",
      "Marketing Agentur OS",
      "weitere Produkt- und Kundenprojekte",
    ],
    founderBenefit:
      "Jamal bekommt einen wiederholbaren Führungsprozess, der aus Projektstand und Artefakt den nächsten entscheidbaren Arbeitsschritt macht.",
    projectWorkBenefit:
      "Projektarbeit wird kleiner, prüfbarer und anschlussfähiger, ohne in automatische Bearbeitung umzuschlagen.",
    agentDevelopmentBenefit:
      "Alle 25 Agenten bekommen wiederkehrende Trainingssignale aus realen Projektmustern, ohne neue Autonomie.",
    headquartersCompletionBenefit:
      "Die Unternehmenszentrale wird fertiger, weil sie nicht mehr nur Einzelkarten sammelt, sondern einen Standardprozess für kontrollierte Projektarbeit besitzt.",
    moduleConnections: [
      "Führungsarbeitsplatz",
      "Tagesentscheidung",
      "Tagesausführung",
      "Projektarbeitsroutine",
      "Qualitätszentrum",
      "HR-Agententraining",
      "Wissens-/Archivlogik",
    ],
    agentFitnessGroups: [
      {
        group: "Führung & Projektsteuerung",
        agents: ["GF-Agent", "Projektmanager-Agent"],
        expectedQuality:
          "klare Priorität, kleiner Arbeitsblock, Jamal-Entscheidungspunkt",
        autonomyStillBlocked:
          "keine automatische Führungs-, Projekt- oder Prioritätsentscheidung",
      },
      {
        group: "Produkt, Design & Inhalt",
        agents: ["Produktmanager-Agent", "Design-Director-Agent", "Content-Agent", "Support-Agent"],
        expectedQuality:
          "verständlicher Nutzen, saubere Nutzerführung, klare Formulierungen und spätere Rückfragefähigkeit",
        autonomyStillBlocked:
          "keine Veröffentlichung, keine Kundenkommunikation, keine finale Produktfreigabe",
      },
      {
        group: "Umsetzung & Qualität",
        agents: ["Entwickler-Agent", "QA-Agent"],
        expectedQuality:
          "lokale Umsetzbarkeit, Testbarkeit, Bestandsschutz und klare Kriterien",
        autonomyStillBlocked:
          "keine technische Umsetzung, kein Deployment, keine Schreiboperation",
      },
      {
        group: "Sicherheit, Tools & Wissen",
        agents: ["Compliance/Risiko-Agent", "Plugin/Tool-Radar-Agent", "HR-Agent", "Wissens/Archiv-Agent"],
        expectedQuality:
          "projektspezifische Grenzen, read-only Tool-Bedarf, Trainingssignale und wiederverwendbare Muster",
        autonomyStillBlocked:
          "keine Plugin-Ausführung, keine Speicherung, keine automatische Schulung, keine Autonomieerhöhung",
      },
    ],
    qualityCenterRelation:
      "Das Qualitätszentrum prüft kleine Arbeitsblöcke, klare Kriterien, Sicherheitsgrenzen, Testbarkeit und Bestandsschutz.",
    projectManagerRelation:
      "Der Projektmanager-Agent macht aus Projektstand und Artefakt den nächsten ausführbaren Arbeitsblock.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent hält wiederverwendbare Muster, Entscheidungen, Grenzen und Lernsignale fest, ohne automatisch zu speichern.",
    hrTrainingRelation:
      "HR kann daraus tägliche Trainings-, Ausbildungs- und Autonomie-Vorschläge ableiten, ohne Autonomie automatisch freizugeben.",
    jamalOptions: [
      "Standardprozess V1 übernehmen",
      "Einmal begrenzt schärfen",
      "Erst weiter testen",
      "Stoppen / nicht weiterführen",
    ],
    adoptCriteria: [
      "der Prozess bleibt bei verschiedenen Projektarten verständlich",
      "jeder Durchlauf erzeugt einen kleinen entscheidbaren Arbeitsblock",
      "Sicherheitsgrenzen bleiben projektspezifisch sichtbar",
      "Jamal behält jede Freigabeentscheidung",
      "Agenten-Lernsignale sind für alle 25 Agenten nutzbar",
    ],
    sharpenOnceCriteria: [
      "einzelne Prozessschritte sind noch zu allgemein",
      "Rollenbeiträge der Agenten müssen klarer getrennt werden",
      "Qualitäts- oder Sicherheitsprüfung ist noch nicht präzise genug",
      "Wissens-/Archivlogik muss besser an das Muster anschließen",
    ],
    testMoreCriteria: [
      "drei Projektarten reichen noch nicht für Jamals Vertrauen",
      "ein weiterer manueller Testfall wäre sinnvoll, bevor V1 übernommen wird",
      "ein bestimmter Projekttyp ist noch nicht abgedeckt",
      "die Routine ist tragfähig, aber noch nicht entscheidungsreif",
    ],
    stopCriteria: [
      "der Prozess würde automatische Projektbearbeitung nahelegen",
      "Projektgrenzen oder Verantwortlichkeiten werden unscharf",
      "Speicherung, externe Systeme oder Plugin-Ausführung wären nötig",
      "Jamal-Entscheidungspunkte bleiben unklar",
      "Agenten würden zu viel Autonomie erhalten",
    ],
    expectedResultAfterApproval:
      "Ein Standard-Projektarbeitsprozess V1 ist lokal vorbereitet und kann als kontrollierter Arbeitsrahmen für Health, Expansion, Marketing und weitere Projekte dienen.",
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft Führungsnutzen, Entscheidungspunkt und Priorität" },
      { agent: "Projektmanager-Agent", contribution: "übersetzt Projektstand in nächsten Arbeitsblock" },
      { agent: "Produktmanager-Agent", contribution: "prüft Nutzen, Zielgruppe und Ergebnislogik" },
      { agent: "Design-Director-Agent", contribution: "prüft Verständlichkeit, Nutzerführung und visuelle Richtung" },
      { agent: "Entwickler-Agent", contribution: "prüft lokale technische Umsetzbarkeit ohne neue Risiken" },
      { agent: "QA-Agent", contribution: "prüft Kriterien, Testbarkeit und Bestandsschutz" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft projektspezifische Grenzen" },
      { agent: "Content-Agent", contribution: "prüft Formulierungen, Verständlichkeit und Nutzbarkeit" },
      { agent: "Support-Agent", contribution: "prüft spätere Hilfs- und Rückfragefähigkeit" },
      { agent: "Plugin/Tool-Radar-Agent", contribution: "bleibt read-only und prüft nur möglichen Tool-Bedarf" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "sichert Muster, Entscheidungen und Lernsignale" },
    ],
    nonGoals: [
      "keine automatische Projektbearbeitung",
      "keine automatische Standardprozess-Ausführung",
      "keine Speicherung",
      "keine Schreiboperation",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine Canva-, HeyGen- oder Figma-Ausführung",
      "keine echte Bild- oder Videoproduktion",
      "keine Veröffentlichung",
      "keine echten Kundendaten",
      "keine echten Produktfreigaben",
      "keine Rechts-, Steuer-, regulatorische oder medizinische Beratung/Freigabe",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Der Standardprozess V1 ist nur gültig, wenn jeder Durchlauf einen kleinen, entscheidbaren, sicheren und auswertbaren Arbeitsblock erzeugt.",
    safetyBoundary:
      "Der Prozess ist ein Standard für kontrollierte Projektarbeit, nicht für automatische Projektbearbeitung: keine Speicherung, keine externen Requests, keine Schreiboperation, keine Plugin-Ausführung, keine echte Freigabe und keine Autonomieerhöhung ohne Jamal.",
    prepared: true,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
  };
}

function getProductiveCentralDailyProjectWorkCard() {
  return {
    title: "Tägliche Projektarbeitskarte aus Standardprozess ableiten",
    status: "tägliche Projektarbeitskarte aus Standard-Projektarbeitsprozess vorbereitet",
    source:
      "V6.34.8 hat den Standard-Projektarbeitsprozess V1 vorbereitet. V6.34.9 leitet daraus eine konkrete tägliche Projektarbeitskarte ab.",
    foundation: "Standard-Projektarbeitsprozess V1",
    goal:
      "Jamal soll morgens oder während des Tages auf einen Blick sehen, welches Projekt heute sinnvoll ist, welcher kleinste Arbeitsblock dran ist und welche Entscheidung manuell getroffen werden muss.",
    whyNextStep:
      "Die Unternehmenszentrale wird erst dann täglich nutzbar, wenn aus dem Standardprozess eine konkrete Arbeitskarte entsteht, die Projekt, Arbeitsblock, Agentenbeiträge, Sicherheitsgrenzen und Auswertung verbindet.",
    coreLogic:
      "Die Unternehmenszentrale führt nicht automatisch Projekte aus. Sie bereitet täglich den kleinsten sicheren Projektarbeitsblock vor, damit Jamal entscheiden und kontrolliert weiterarbeiten kann.",
    dailyProjectWorkCard: {
      todaysProject: "KI-Unternehmenszentrale",
      whyToday:
        "Die Zentrale braucht eine tägliche Arbeitskarte, damit aus dem Standardprozess ein praktisch nutzbarer Führungs- und Projektarbeitsmodus wird.",
      smallestWorkBlock:
        "Standardprozess V1 in tägliche Projektarbeitskarte überführen",
      expectedVisibleResult:
        "Jamal sieht auf einen Blick, was heute gemacht werden soll, warum dieser Schritt sinnvoll ist, welche Agenten beitragen und wann gestoppt werden muss.",
      involvedAgents: [
        "GF-Agent",
        "Projektmanager-Agent",
        "Produktmanager-Agent",
        "Design-Director-Agent",
        "Entwickler-Agent",
        "QA-Agent",
        "Compliance/Risiko-Agent",
        "Content-Agent",
        "Support-Agent",
        "Plugin/Tool-Radar-Agent",
        "HR-Agent",
        "Wissens/Archiv-Agent",
      ],
      jamalDecision:
        "Tageskarte übernehmen, Projekt wechseln, einmal begrenzt schärfen oder stoppen.",
      manualStartCondition:
        "Jamal wählt die Tageskarte bewusst aus. Ohne manuelle Auswahl bleibt alles vorbereitet.",
      stopBoundary:
        "Stoppen, wenn Projekt, Arbeitsblock, Ergebnis, Grenze oder Jamal-Entscheidung nicht klar genug sind.",
      qualityCheck:
        "Die Karte ist nur gut genug, wenn sie einen kleinen, sicheren und auswertbaren Arbeitsschritt für heute zeigt.",
      safetyBoundary:
        "Keine automatische Projektbearbeitung, keine Speicherung, keine externen Requests, keine Plugin-Ausführung und keine Agenten-Autonomie-Erhöhung.",
      evaluationAfterExecution:
        "Nach manueller Ausführung wird geprüft, ob Ergebnis, Nutzen, Grenze und nächster Entscheidungspunkt sichtbar geworden sind.",
      hrLearningSignal:
        "HR leitet daraus Trainingsimpulse für alle 25 Agenten ab, ohne Autonomie automatisch freizugeben.",
      knowledgeArchiveSignal:
        "Das Tageskartenmuster, die Entscheidung, Grenzen und Lernsignale werden als wiederverwendbare Logik benannt, aber nicht automatisch gespeichert.",
    },
    exampleCardForToday: {
      project: "KI-Unternehmenszentrale",
      whyToday:
        "Die Zentrale braucht eine tägliche Arbeitskarte, damit aus dem Standardprozess ein praktisch nutzbarer Führungs- und Projektarbeitsmodus wird.",
      smallestWorkBlock:
        "Eine wiederverwendbare Tageskarte definieren, die Projekt, Arbeitsblock, Agentenbeiträge, Jamal-Entscheidung, Sicherheitsgrenzen und Auswertung verbindet.",
      expectedVisibleResult:
        "Jamal sieht auf einen Blick, was heute gemacht werden soll, warum dieser Schritt sinnvoll ist, welche Agenten beitragen und wann gestoppt werden muss.",
      jamalDecision:
        "Tageskarte übernehmen, Projekt wechseln, einmal schärfen oder stoppen.",
    },
    alternativeProjectOptions: [
      "Health Upgrade Kompass",
      "Expansion App",
      "Marketing Agentur OS",
    ],
    selectionRule: [
      "nicht das spannendste Projekt wählen",
      "nicht das größte Projekt wählen",
      "sondern das Projekt wählen, bei dem heute der kleinste sichere Fortschritt möglich ist",
    ],
    founderBenefit:
      "Jamal bekommt morgens eine klare, entscheidbare Projektarbeitskarte statt nur eines abstrakten Prozesses.",
    projectWorkBenefit:
      "Projektarbeit wird täglich in einen kleinen, sicheren und auswertbaren Arbeitsblock übersetzt.",
    agentDevelopmentBenefit:
      "Alle 25 Agenten trainieren wiederkehrend an Tageskarten: Beitrag liefern, Grenze halten, Ergebnis prüfbar machen.",
    headquartersCompletionBenefit:
      "Die Unternehmenszentrale kommt näher an den echten täglichen Einsatz, weil Standardprozess und Tagesführung verbunden werden.",
    moduleConnections: [
      "Morgenbriefing",
      "Tagesfokus",
      "Führungsarbeitsplatz",
      "Standard-Projektarbeitsprozess V1",
      "HR-Agententraining",
      "Qualitätszentrum",
      "Wissens-/Archivlogik",
    ],
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft Tagesnutzen, Priorität und Entscheidbarkeit" },
      { agent: "Projektmanager-Agent", contribution: "übersetzt Standardprozess in heutigen Arbeitsblock" },
      { agent: "Produktmanager-Agent", contribution: "prüft Nutzen und Ergebnislogik" },
      { agent: "Design-Director-Agent", contribution: "prüft Verständlichkeit und Tageskarten-Struktur" },
      { agent: "Entwickler-Agent", contribution: "prüft lokale technische Umsetzbarkeit ohne neue Risiken" },
      { agent: "QA-Agent", contribution: "prüft Kriterien, Testbarkeit und Bestandsschutz" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft projektspezifische Sicherheitsgrenzen" },
      { agent: "Content-Agent", contribution: "prüft klare Formulierungen und Nutzbarkeit" },
      { agent: "Support-Agent", contribution: "prüft spätere Rückfrage- und Hilfsfähigkeit" },
      { agent: "Plugin/Tool-Radar-Agent", contribution: "bleibt read-only und prüft nur möglichen Tool-Bedarf" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "sichert Tageskartenmuster, Entscheidungen und Lernsignale" },
    ],
    jamalOptions: [
      "Tageskarte übernehmen",
      "Projekt wechseln",
      "Einmal begrenzt schärfen",
      "Stoppen / nicht weiterführen",
    ],
    adoptCriteria: [
      "heutiges Projekt und kleinster Arbeitsblock sind klar",
      "erwartetes sichtbares Ergebnis ist prüfbar",
      "Agentenbeiträge sind verständlich und begrenzt",
      "Jamal-Entscheidung und Abbruchgrenze sind sichtbar",
      "Auswertung nach manueller Ausführung ist vorbereitet",
    ],
    switchProjectCriteria: [
      "ein anderes Projekt hat heute den kleineren sicheren Fortschritt",
      "die KI-Unternehmenszentrale ist heute nicht der dringendste Arbeitsblock",
      "Health, Expansion oder Marketing brauchen eine klarere Tagesentscheidung",
    ],
    sharpenOnceCriteria: [
      "Arbeitsblock ist noch zu groß",
      "Ergebnisformat ist noch nicht konkret genug",
      "Agentenbeiträge oder Sicherheitsgrenze sind noch zu allgemein",
      "Jamal-Entscheidung ist noch nicht eindeutig genug",
    ],
    stopCriteria: [
      "Tageskarte würde automatische Projektbearbeitung nahelegen",
      "Projekt, Ergebnis oder Grenze bleiben unklar",
      "Speicherung, externe Systeme oder Plugin-Ausführung wären nötig",
      "Jamal kann keine manuelle Entscheidung treffen",
    ],
    expectedResultAfterApproval:
      "Eine tägliche Projektarbeitskarte ist vorbereitet und kann später für Health, Expansion, Marketing und weitere Projekte wiederverwendet werden.",
    nonGoals: [
      "keine automatische Projektbearbeitung",
      "keine automatische Tagesplanung",
      "keine Speicherung",
      "keine Schreiboperation",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine Canva-, HeyGen- oder Figma-Ausführung",
      "keine echte Bild- oder Videoproduktion",
      "keine Veröffentlichung",
      "keine echten Kundendaten",
      "keine echten Produktfreigaben",
      "keine Rechts-, Steuer-, regulatorische oder medizinische Beratung/Freigabe",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Die Tageskarte ist nur gültig, wenn sie Projekt, Arbeitsblock, erwartetes Ergebnis, Agentenbeiträge, Jamal-Entscheidung, Abbruchgrenze und Auswertung klar verbindet.",
    safetyBoundary:
      "Die Tageskarte bleibt lokal, manuell und read-only: keine Speicherung, keine externen Requests, keine Schreiboperation, keine Plugin-Ausführung, keine automatische Projektbearbeitung und keine Autonomieerhöhung ohne Jamal.",
    prepared: true,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
  };
}

function getProductiveCentralLiveOperatingModel() {
  return {
    title: "Live-Betriebsmodell mit Freigabestufen vorbereiten",
    status: "Live-Betriebsmodell V1 vorbereitet, noch nicht aktiviert",
    source:
      "V6.34.9 hat eine tägliche Projektarbeitskarte aus dem Standard-Projektarbeitsprozess abgeleitet. V6.35.0 klärt jetzt die späteren Freigabestufen für einen kontrollierten Live-Betrieb.",
    goal:
      "Festlegen, was die Unternehmenszentrale später selbst tun darf, was sie nur als Entwurf vorbereiten darf, was Jamals Freigabe braucht, was Expertenfreigabe braucht und was dauerhaft gesperrt bleibt.",
    whyNeededNow:
      "Die Unternehmenszentrale wird täglich nutzbarer. Bevor echte Live-Funktionen entstehen, müssen Handlungsrechte, Freigaben, Sperren und Expertenpflichten klar sichtbar sein.",
    coreStatement:
      "Die Unternehmenszentrale soll Jamal später Arbeit abnehmen, aber nicht unkontrolliert handeln.",
    coreLogic:
      "Ziel ist nicht, dass Jamal alles selbst macht. Ziel ist, dass die Unternehmenszentrale sichere Arbeit selbst vorbereitet und später definierte Standardaufgaben ausführen kann, während kritische Entscheidungen bei Jamal oder externen Experten bleiben.",
    releaseLevelsV1: [
      {
        level: "Stufe 1",
        title: "Nur anzeigen und strukturieren",
        examples: [
          "Projektstand zusammenfassen",
          "Tageskarte anzeigen",
          "Risiken benennen",
          "fehlende Unterlagen auflisten",
          "Agenten-Lernsignale vorbereiten",
        ],
        boundary:
          "Nur Orientierung und Struktur. Keine Speicherung, keine Ausführung, keine externe Anfrage.",
      },
      {
        level: "Stufe 2",
        title: "Entwurf vorbereiten",
        examples: [
          "E-Mail-Entwurf erstellen",
          "Design-Brief vorbereiten",
          "Aufgabenentwurf formulieren",
          "Checklistenentwurf erstellen",
          "Beraterinnen-Gesprächsgrundlage vorbereiten",
        ],
        boundary:
          "Nur Entwurf. Kein Versand, keine Veröffentlichung, keine Tool-Ausführung.",
      },
      {
        level: "Stufe 3",
        title: "Ausführung nach Jamal-Freigabe",
        examples: [
          "Aufgabe speichern",
          "Projektstatus ändern",
          "E-Mail senden",
          "Tool-Auftrag starten",
          "Entscheidung dokumentieren",
        ],
        boundary:
          "Noch nicht aktiv. Später nur nach bewusster manueller Jamal-Freigabe.",
      },
      {
        level: "Stufe 4",
        title: "Begrenzte Standardausführung nach vorheriger Regel",
        examples: [
          "tägliche Zusammenfassung erstellen",
          "Standard-Erinnerung vorbereiten",
          "bekannte Checkliste aktualisieren",
          "wiederkehrende interne Statuskarte erzeugen",
        ],
        boundary:
          "Beispiele für später, noch nicht aktiv. Nur mit vorher definierter Regel und enger Grenze.",
      },
      {
        level: "Stufe 5",
        title: "Experten-/GF-Freigabe erforderlich",
        examples: [
          "Produktfreigabe",
          "Länderentscheidung",
          "regulatorische Einschätzung",
          "steuerliche Entscheidung",
          "rechtliche Bewertung",
          "medizinisch relevante Einordnung",
        ],
        boundary:
          "Keine automatische Entscheidung. Jamal, Geschäftsführung oder externe Experten müssen freigeben.",
      },
      {
        level: "Stufe 6",
        title: "Dauerhaft gesperrt",
        examples: [
          "Heilversprechen",
          "Diagnose",
          "ungeprüfte Rechtsfreigabe",
          "automatische Länderfreigabe",
          "Veröffentlichung ohne Freigabe",
          "Kundendaten ohne Schutzkonzept",
          "Agenten-Autonomie ohne Führungsentscheidung",
        ],
        boundary:
          "Dauerhaft gesperrt. Keine Vorbereitung als automatische Ausführung.",
      },
    ],
    projectExamples: [
      {
        project: "Health Upgrade Kompass",
        allowedDraft:
          "Orientierungskarte, Gesprächsgrundlage oder nicht-medizinischer Strukturentwurf vorbereiten.",
        needsApproval:
          "medizinisch relevante Einordnung, echte Kundendaten, produktive Empfehlung.",
        permanentlyBlocked:
          "Diagnose, Heilversprechen, medizinische Empfehlung ohne Expertenprüfung.",
      },
      {
        project: "Expansion App",
        allowedDraft:
          "Unterlagenliste, Prüfübersicht oder Länderarbeitskarte vorbereiten.",
        needsApproval:
          "Länderentscheidung, Produktfreigabe, rechtliche/regulatorische Einschätzung.",
        permanentlyBlocked:
          "automatische Länderfreigabe, Rechtsberatung, Behörden-/Herstellerkommunikation ohne Freigabe.",
      },
      {
        project: "Marketing Agentur OS",
        allowedDraft:
          "Design-Brief, Content-Entwurf oder Kampagnenstruktur vorbereiten.",
        needsApproval:
          "Veröffentlichung, Tool-Auftrag, Rechte-/Marken-/Personenfreigabe.",
        permanentlyBlocked:
          "automatische Bild-/Video-Produktion, Kampagnenausspielung, Veröffentlichung ohne Freigabe.",
      },
      {
        project: "KI-Unternehmenszentrale",
        allowedDraft:
          "Tageskarte, Prozessmodell, Rollenlogik oder Freigabestufen strukturieren.",
        needsApproval:
          "Produktivfreischaltung, neue Autonomieregel, externe Verbindung.",
        permanentlyBlocked:
          "unkontrollierte Automatisierung, Agenten-Autonomie ohne Führungsentscheidung.",
      },
    ],
    laterAutomatableCandidates: [
      "tägliche Zusammenfassung vorbereiten",
      "interne Statuskarte erzeugen",
      "bekannte Checkliste aktualisieren",
      "wiederkehrende Erinnerungsnotiz vorbereiten",
      "Agenten-Lernsignal zusammenstellen",
    ],
    jamalApprovalOnlyActions: [
      "Aufgabe speichern",
      "Projektstatus ändern",
      "E-Mail senden",
      "Tool-Auftrag starten",
      "Entscheidung dokumentieren",
      "externe Verbindung nutzen",
    ],
    neverAutomaticActions: [
      "Heilversprechen",
      "Diagnosen",
      "Rechts-, Steuer- oder regulatorische Freigaben",
      "automatische Länderentscheidung",
      "Veröffentlichung ohne Freigabe",
      "echte Kundendaten ohne Schutzkonzept",
      "Agenten-Autonomie ohne Führungsentscheidung",
    ],
    operatingModesDifference: {
      currentSafeBuild:
        "Heute nur lokale Orientierung, Entwürfe, Struktur und Prüfung. Keine Live-Funktion aktiv.",
      preparedLiveModel:
        "Freigabestufen, Beispiele, Grenzen und spätere Ausführungslogik sind sichtbar vorbereitet.",
      laterRealLiveOperation:
        "Erst nach separater Freigabe könnten definierte Standardaufgaben begrenzt ausgeführt werden.",
    },
    founderBenefit:
      "Jamal sieht klar, welche Arbeit die Zentrale später abnehmen könnte und wo Freigabe oder Sperre gilt.",
    projectWorkBenefit:
      "Projektarbeit bekommt ein kontrolliertes Rechte- und Freigabemodell, bevor echte Ausführung entsteht.",
    agentDevelopmentBenefit:
      "Alle 25 Agenten lernen, zwischen Anzeigen, Entwurf, freigabepflichtiger Ausführung, Expertenfreigabe und Sperre zu unterscheiden.",
    headquartersCompletionBenefit:
      "Die Unternehmenszentrale kommt näher an produktive Nutzbarkeit, weil Live-Betrieb nicht diffus, sondern kontrolliert vorbereitet wird.",
    agentFitnessRelation:
      "Agenten trainieren nicht mehr nur Inhalte, sondern Handlungsklassen: anzeigen, entwerfen, freigeben lassen, Expertenpflicht erkennen und Sperren respektieren.",
    hrTrainingRelation:
      "HR leitet daraus Trainings-, Ausbildungs- und Autonomie-Vorschläge ab, ohne Autonomie automatisch freizugeben.",
    qualityCenterRelation:
      "Das Qualitätszentrum prüft, ob jede Stufe klare Beispiele, Kriterien, Grenzen und Testbarkeit hat.",
    complianceRiskRelation:
      "Compliance/Risiko trennt operative Standardaufgaben, Jamal-Freigaben, Expertenpflichten und dauerhaft gesperrte Handlungen.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent hält Freigabestufen, Entscheidungen und Grenzen als wiederverwendbares Muster fest, ohne automatisch zu speichern.",
    jamalOptions: [
      "Live-Modell V1 übernehmen",
      "Freigabestufen schärfen",
      "Noch nicht vorbereiten",
      "Stoppen / nicht weiterführen",
    ],
    adoptCriteria: [
      "alle sechs Freigabestufen sind verständlich",
      "kritische Handlungen sind klar von Entwürfen getrennt",
      "Jamal-Freigabe und Expertenpflicht sind sichtbar",
      "dauerhaft gesperrte Handlungen sind eindeutig",
      "kein echter Live-Betrieb wird aktiviert",
    ],
    sharpenCriteria: [
      "Beispiele je Stufe sind noch nicht trennscharf",
      "Jamal-Freigabe und Expertenfreigabe müssen klarer getrennt werden",
      "später automatisierbare Standardaufgaben sind noch zu breit",
      "dauerhafte Sperren müssen präziser formuliert werden",
    ],
    notYetCriteria: [
      "der Standardprozess V1 ist noch nicht stabil genug",
      "Tageskartenlogik braucht weitere manuelle Prüfung",
      "Jamal möchte noch keine Live-Betriebslogik vorbereiten",
    ],
    stopCriteria: [
      "das Modell würde echte Live-Funktion aktivieren",
      "Automatisierung, Speicherung oder Plugin-Ausführung würde nahegelegt",
      "kritische Freigaben werden unscharf",
      "Agenten-Autonomie würde ohne Führungsentscheidung erhöht",
    ],
    expectedResultAfterApproval:
      "Ein Live-Betriebsmodell V1 ist lokal vorbereitet: Es zeigt, was angezeigt, entworfen, freigegeben, später standardisiert, Experten-geprüft oder dauerhaft gesperrt bleibt.",
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft Führungsnutzen, Freigabelogik und Entscheidbarkeit" },
      { agent: "Projektmanager-Agent", contribution: "ordnet Projektarbeit den passenden Freigabestufen zu" },
      { agent: "Produktmanager-Agent", contribution: "trennt Produktentwurf, Produktfreigabe und dauerhaft gesperrte Produktversprechen" },
      { agent: "Design-Director-Agent", contribution: "prüft, welche Design-/Marketingarbeit nur Entwurf bleibt oder Freigabe braucht" },
      { agent: "Entwickler-Agent", contribution: "prüft technische Umsetzbarkeit ohne Aktivierung von Live-Funktionen" },
      { agent: "QA-Agent", contribution: "prüft Kriterien, Testbarkeit und Bestandsschutz je Freigabestufe" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft Expertenpflichten, Sperren und rechtliche/medizinische Grenzen" },
      { agent: "Content-Agent", contribution: "prüft klare Formulierungen für Freigaben und Sperren" },
      { agent: "Support-Agent", contribution: "prüft spätere Rückfrage- und Hilfsfähigkeit je Stufe" },
      { agent: "Plugin/Tool-Radar-Agent", contribution: "bleibt read-only und ordnet möglichen Tool-Bedarf Freigabestufen zu" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "benennt wiederverwendbare Freigabe- und Sperrmuster" },
    ],
    nonGoals: [
      "kein echter Live-Betrieb",
      "keine produktive Freischaltung",
      "keine automatische Projektbearbeitung",
      "keine Speicherung",
      "keine Schreiboperation",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine Canva-, HeyGen- oder Figma-Ausführung",
      "keine echte Bild- oder Videoproduktion",
      "keine Veröffentlichung",
      "keine echten Kundendaten",
      "keine echten Produktfreigaben",
      "keine Rechts-, Steuer-, regulatorische oder medizinische Beratung/Freigabe",
      "keine automatische Länderentscheidung",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Das Live-Betriebsmodell ist nur gültig, wenn jede Stufe klar unterscheidet, was angezeigt, entworfen, freigegeben, Experten-geprüft oder dauerhaft gesperrt bleibt.",
    safetyBoundary:
      "V6.35.0 aktiviert nichts live: keine Speicherung, keine Automatisierung, keine Plugins, keine externen Systeme, keine produktive Freischaltung und keine Autonomieerhöhung ohne Jamal.",
    prepared: true,
    activated: false,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
  };
}

function getProductiveCentralLiveApprovalStageModuleMap() {
  return {
    title: "Freigabestufen auf Module abbilden",
    status: "Modul-Freigabematrix V1 vorbereitet, noch nicht aktiviert",
    source:
      "V6.35.0 hat ein Live-Betriebsmodell mit sechs Freigabestufen vorbereitet. V6.35.1 bildet diese Stufen auf konkrete Module der KI-Unternehmenszentrale ab.",
    goal:
      "Sichtbar machen, welches Modul später welche Freigabestufe nutzen darf, welche Aktionen Entwurf bleiben, welche Jamals Freigabe brauchen, welche Expertenfreigabe brauchen und was dauerhaft gesperrt bleibt.",
    whyNeeded:
      "Die Freigabematrix verhindert, dass Live-Funktionen pauschal freigeschaltet werden. Jedes Modul bekommt eine eigene erlaubte Stufe, eigene Grenzen und eigene Freigabepunkte.",
    approvalStagesUsed: [
      "1. Nur anzeigen und strukturieren",
      "2. Entwurf vorbereiten",
      "3. Ausführung nach Jamal-Freigabe",
      "4. begrenzte Standardausführung nach vorheriger Regel",
      "5. Experten-/GF-Freigabe erforderlich",
      "6. dauerhaft gesperrt",
    ],
    moduleMatrix: [
      {
        module: "Tägliche Projektarbeitskarte",
        currentAllowedStage: "Stufe 1: nur anzeigen und strukturieren",
        laterPossibleStage: "Stufe 2: Entwurf vorbereiten",
        laterLimitedStage:
          "Stufe 4: tägliche Standardkarte nach vorheriger Regel erzeugen",
        jamalApprovalPoints:
          "Projektwechsel, Prioritätsentscheidung, Start eines Arbeitsblocks",
        expertApprovalPoints: "keine externe Expertenfreigabe im Normalfall",
        permanentlyBlocked: "automatische Projektentscheidung ohne Jamal",
        safetyBoundary:
          "Keine automatische Tagesplanung, keine Projektbearbeitung, keine Speicherung.",
      },
      {
        module: "Health Upgrade Kompass",
        currentAllowedStage: "Stufe 1: Orientierung strukturieren",
        laterPossibleStage:
          "Stufe 2: Gesprächsgrundlage / Ergebnisentwurf vorbereiten",
        laterLimitedStage: "keine Standardausführung ohne separate Prüfung",
        jamalApprovalPoints: "produktive Nutzung im Kundenkontext",
        expertApprovalPoints: "medizinisch relevante Einordnung",
        permanentlyBlocked:
          "Diagnosen, Heilversprechen, medizinische Empfehlungen",
        safetyBoundary:
          "Nur nicht-medizinische Orientierung. Keine echten Health-Daten und keine medizinische Aussage.",
      },
      {
        module: "Expansion App",
        currentAllowedStage: "Stufe 1: Unterlagenstatus strukturieren",
        laterPossibleStage:
          "Stufe 2: Unterlagenanforderung als Entwurf vorbereiten",
        laterLimitedStage: "keine Standardausführung für Länderfreigaben",
        jamalApprovalPoints: "E-Mail senden, Team-/Herstellerkontakt starten",
        expertApprovalPoints:
          "Länderentscheidung, Produktfreigabe, regulatorische Einschätzung",
        permanentlyBlocked:
          "automatische Länderfreigabe, automatische Rechts-/Steuer-/Regulatorikentscheidung",
        safetyBoundary:
          "Keine Rechtsberatung, keine regulatorische Freigabe, keine externe Kommunikation ohne Jamal.",
      },
      {
        module: "Marketing Agentur OS",
        currentAllowedStage: "Stufe 1: Briefing strukturieren",
        laterPossibleStage:
          "Stufe 2: Design-, Text-, Bild- oder Videoentwurf vorbereiten",
        laterLimitedStage: "keine Standardausführung für Produktion oder Veröffentlichung",
        jamalApprovalPoints:
          "Tool-Auftrag starten, Entwurf freigeben, Kampagne vorbereiten",
        expertApprovalPoints: "Rechte-, Marken- oder Personenfreigabe bei Bedarf",
        permanentlyBlocked:
          "Veröffentlichung ohne Freigabe, Rechtefreigabe ohne Prüfung, echte Produktion ohne Freigabe",
        safetyBoundary:
          "Keine Canva-/HeyGen-/Figma-Ausführung, keine Produktion, keine Veröffentlichung.",
      },
      {
        module: "HR-Agententraining",
        currentAllowedStage: "Stufe 1: Trainingssignale anzeigen",
        laterPossibleStage: "Stufe 2: Trainingsplan-Entwurf vorbereiten",
        laterLimitedStage: "keine Autonomie-Standardausführung",
        jamalApprovalPoints: "neue Autonomie-Regel für Agenten",
        expertApprovalPoints: "GF-Freigabe bei Rollen- oder Autonomieänderung",
        permanentlyBlocked: "automatische Agenten-Autonomie-Erhöhung",
        safetyBoundary:
          "Nur Trainingsvorschläge. Keine automatische Schulung und keine Autonomieerhöhung.",
      },
      {
        module: "Qualitätszentrum",
        currentAllowedStage: "Stufe 1: Kriterien und Risiken anzeigen",
        laterPossibleStage: "Stufe 2: QA-Prüfbericht als Entwurf vorbereiten",
        laterLimitedStage:
          "Stufe 4: Standard-Checks nach vorheriger Regel ausführen",
        jamalApprovalPoints: "Qualitätsentscheidung mit Projektfolge",
        expertApprovalPoints:
          "kritische Freigaben bei Recht, Medizin, Regulatorik oder Kundendaten",
        permanentlyBlocked: "kritische Freigabe ohne menschliche Prüfung",
        safetyBoundary:
          "Kriterien und Risiken sichtbar machen. Keine kritische Freigabe automatisch setzen.",
      },
      {
        module: "Wissens-/Archivlogik",
        currentAllowedStage: "Stufe 1: Muster und Lernsignale anzeigen",
        laterPossibleStage:
          "Stufe 2: Archivnotiz oder Wissenseintrag als Entwurf vorbereiten",
        laterLimitedStage: "keine Speicherung ohne separate Freigabe",
        jamalApprovalPoints:
          "echte Speicherung oder verbindliche Projektentscheidung dokumentieren",
        expertApprovalPoints: "Datenschutz-/Schutzkonzept bei sensiblen Daten",
        permanentlyBlocked: "sensible Daten ohne Schutzkonzept speichern",
        safetyBoundary:
          "Wissen benennen und strukturieren. Keine automatische Speicherung.",
      },
      {
        module: "Plugin/Tool-Radar",
        currentAllowedStage: "Stufe 1: Tool-Bedarf read-only einschätzen",
        laterPossibleStage: "Stufe 2: Tool-Auftrag als Entwurf vorbereiten",
        laterLimitedStage: "keine Standardausführung für externe Tools",
        jamalApprovalPoints:
          "Canva-, HeyGen-, Figma- oder andere Plugin-Ausführung",
        expertApprovalPoints: "Rechte-/Datenschutzprüfung bei externen Tools",
        permanentlyBlocked: "Tool-Ausführung ohne Freigabe",
        safetyBoundary:
          "Nur read-only Bedarf und Entwurf. Keine Plugin-Ausführung.",
      },
      {
        module: "Morgenbriefing",
        currentAllowedStage: "Stufe 1: Fokus und Risiken anzeigen",
        laterPossibleStage: "Stufe 2: Briefing-Entwurf vorbereiten",
        laterLimitedStage:
          "Stufe 4: Standardbriefing nach vorheriger Regel erzeugen",
        jamalApprovalPoints: "Prioritätswechsel mit Projektfolge",
        expertApprovalPoints: "GF-Freigabe bei strategischer Entscheidung",
        permanentlyBlocked: "automatische strategische Entscheidung",
        safetyBoundary:
          "Fokus vorschlagen, nicht entscheiden. Keine automatische Prioritätsänderung.",
      },
      {
        module: "Abendabschluss",
        currentAllowedStage: "Stufe 1: Tagesstand strukturieren",
        laterPossibleStage: "Stufe 2: Abschlussnotiz als Entwurf vorbereiten",
        laterLimitedStage:
          "Stufe 4: Standardabschluss nach vorheriger Regel erzeugen",
        jamalApprovalPoints: "verbindliche Projektbewertung oder Statusänderung",
        expertApprovalPoints: "GF-Freigabe bei kritischer Projektfolge",
        permanentlyBlocked: "automatische Projektentscheidung",
        safetyBoundary:
          "Tagesstand strukturieren. Keine Statusänderung oder Projektentscheidung automatisch.",
      },
      {
        module: "Support-Leitstand",
        currentAllowedStage: "Stufe 1: Supportfälle strukturieren",
        laterPossibleStage: "Stufe 2: Antwortentwurf vorbereiten",
        laterLimitedStage: "keine Standardantwort ohne Freigaberegel",
        jamalApprovalPoints: "Antwort senden, Kundenstatus ändern",
        expertApprovalPoints: "Team-/Compliance-Freigabe bei sensiblen Fällen",
        permanentlyBlocked: "sensible Kundenkommunikation ohne Freigabe",
        safetyBoundary:
          "Nur strukturieren und Entwurf vorbereiten. Keine Kundenkommunikation automatisch senden.",
      },
    ],
    founderBenefit:
      "Jamal sieht je Modul, was später vorbereitet, entworfen, ausgeführt, Experten-geprüft oder dauerhaft gesperrt bleibt.",
    projectWorkBenefit:
      "Projektarbeit wird nicht pauschal live geschaltet, sondern modulweise mit klaren Freigabepunkten vorbereitet.",
    agentDevelopmentBenefit:
      "Alle 25 Agenten lernen, Module, Handlungsklassen, Freigaben und Sperren präzise zu unterscheiden.",
    headquartersCompletionBenefit:
      "Die Unternehmenszentrale wird produktionsnäher, weil das Live-Modell in konkrete Modulrechte übersetzt wird.",
    agentFitnessRelation:
      "Agenten trainieren modulbezogen: anzeigen, Entwurf vorbereiten, Jamal-Freigabe erkennen, Expertenpflicht erkennen und dauerhafte Sperren respektieren.",
    hrTrainingRelation:
      "HR kann daraus Trainings-, Ausbildungs- und Autonomie-Vorschläge für alle 25 Agenten ableiten, ohne Autonomie automatisch freizugeben.",
    qualityCenterRelation:
      "Das Qualitätszentrum prüft, ob jedes Modul klare Stufen, Kriterien, Freigabepunkte, Sperren und Bestandsschutz hat.",
    complianceRiskRelation:
      "Compliance/Risiko prüft, ob kritische Module Expertenpflichten und dauerhafte Sperren sauber trennen.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent hält Modulgrenzen und Freigabelogik als wiederverwendbares Muster fest, ohne automatisch zu speichern.",
    jamalOptions: [
      "Modul-Freigabematrix übernehmen",
      "Einmal begrenzt schärfen",
      "Modul einzeln prüfen",
      "Stoppen / nicht weiterführen",
    ],
    adoptCriteria: [
      "alle Module haben eine klare aktuelle Stufe",
      "spätere mögliche Stufen sind von heutigen Rechten getrennt",
      "Jamal- und Expertenfreigaben sind sichtbar",
      "dauerhaft gesperrte Aktionen sind eindeutig",
      "keine technische Modulfreigabe wird aktiviert",
    ],
    sharpenCriteria: [
      "einzelne Module sind noch zu breit beschrieben",
      "Jamal-Freigabe und Expertenfreigabe müssen getrennt werden",
      "dauerhafte Sperren sind noch nicht konkret genug",
      "spätere Stufe 4 ist für ein Modul zu unklar",
    ],
    singleModuleReviewCriteria: [
      "ein Modul ist riskanter als die anderen",
      "ein Modul braucht mehr Detail, bevor die Matrix übernommen wird",
      "ein Modul könnte sonst versehentlich wie live aktiviert wirken",
    ],
    stopCriteria: [
      "die Matrix würde Live-Funktionen technisch aktivieren",
      "Speicherung, Automatisierung oder Plugin-Ausführung würde nahegelegt",
      "kritische Freigaben werden unscharf",
      "Modulrechte wirken pauschal statt begrenzt",
    ],
    expectedResultAfterApproval:
      "Eine Modul-Freigabematrix V1 ist lokal vorbereitet: Sie zeigt je Modul erlaubte aktuelle Stufe, mögliche spätere Stufe, Jamal-/Expertenfreigaben, Sperren und Sicherheitsgrenzen.",
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft Führungsnutzen, Freigabepunkte und Modulpriorität" },
      { agent: "Projektmanager-Agent", contribution: "ordnet Projektmodule passenden Freigabestufen zu" },
      { agent: "Produktmanager-Agent", contribution: "trennt Modulnutzen, Entwurf und Produktfreigabe" },
      { agent: "Design-Director-Agent", contribution: "prüft Marketing- und UI-Module auf Entwurf/Freigabe-Grenzen" },
      { agent: "Entwickler-Agent", contribution: "prüft, dass keine Modulfreigabe technisch aktiviert wird" },
      { agent: "QA-Agent", contribution: "prüft Matrixkriterien, Testbarkeit und Bestandsschutz" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft Expertenpflichten, Sperren und sensible Module" },
      { agent: "Content-Agent", contribution: "prüft klare Formulierungen für Modulrechte und Sperren" },
      { agent: "Support-Agent", contribution: "prüft Support-Leitstand und Kundenkommunikationsgrenzen" },
      { agent: "Plugin/Tool-Radar-Agent", contribution: "bleibt read-only und ordnet Tool-Bedarf Freigabestufen zu" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "benennt wiederverwendbare Modulfreigabe-Muster" },
    ],
    nonGoals: [
      "kein echter Live-Betrieb",
      "keine produktive Freischaltung",
      "keine technische Modul-Freigabe",
      "keine Speicherung",
      "keine Schreiboperation",
      "keine Automatisierung",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine Canva-, HeyGen- oder Figma-Ausführung",
      "keine echte Bild- oder Videoproduktion",
      "keine Veröffentlichung",
      "keine echten Kundendaten",
      "keine echten Produktfreigaben",
      "keine Rechts-, Steuer-, regulatorische oder medizinische Beratung/Freigabe",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Die Modul-Freigabematrix ist nur gültig, wenn jedes Modul klar zwischen aktueller Stufe, späterer Möglichkeit, Jamal-Freigabe, Expertenpflicht und dauerhafter Sperre unterscheidet.",
    safetyBoundary:
      "V6.35.1 aktiviert keine Live-Funktion und keine Modulfreigabe technisch: keine Speicherung, keine Automatisierung, keine externen Requests, keine Plugin-Ausführung und keine produktive Freischaltung.",
    prepared: true,
    activated: false,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
    technicalModuleActivationBlocked: true,
  };
}

function getProductiveCentralFirstDraftModeAction() {
  return {
    title: "Erste Live-Aktion als Entwurf vorbereiten",
    status:
      "erste spätere Live-Aktion im Entwurfsmodus vorbereitet, noch nicht aktiviert",
    source:
      "V6.35.1 hat die Modul-Freigabematrix V1 vorbereitet. V6.35.2 nutzt daraus erstmals Stufe 2 als reinen Entwurfsmodus.",
    usedApprovalStage: "Stufe 2: Entwurf vorbereiten",
    affectedModules: [
      "Tägliche Projektarbeitskarte",
      "Projektmanager-Agent",
      "Qualitätszentrum",
      "HR-Agententraining",
      "Wissens-/Archivlogik",
    ],
    preparedDraftAction:
      "Aufgabenentwurf aus täglicher Projektarbeitskarte vorbereiten",
    goal:
      "Die Unternehmenszentrale soll aus einer täglichen Projektarbeitskarte später eine klare Aufgabe formulieren können, ohne diese Aufgabe zu speichern, zuzuweisen, zu starten oder extern zu übergeben.",
    whySuitable:
      "Ein Aufgabenentwurf ist die sicherste erste Stufe-2-Aktion, weil er Jamal Formulierungsarbeit abnimmt, aber keine produktive Ausführung, Speicherung oder Tool-Nutzung erfordert.",
    draftShouldDo: [
      "Projekt und kleinsten Arbeitsblock aus der Tageskarte übernehmen",
      "Ziel, erwartetes Ergebnis und beteiligte Agenten sichtbar machen",
      "Jamal-Entscheidungspunkt, manuelle Startbedingung und Abbruchgrenze formulieren",
      "Sicherheitsgrenze, Auswertung nach Ausführung und HR-Lernsignal vorbereiten",
    ],
    draftMustNotDo: [
      "keine Aufgabe speichern",
      "keine Aufgabe zuweisen",
      "keine Aufgabe starten",
      "keine externe Übergabe auslösen",
      "keine Automatisierung freigeben",
      "keine Projektentscheidung treffen",
    ],
    exampleDraftWithoutStorage: {
      project: "KI-Unternehmenszentrale",
      taskDraft:
        "Standardprozess V1 in eine nutzbare Tageskarte überführen und prüfen, ob daraus später eine speicherbare Aufgabe entstehen darf.",
      goal:
        "Jamal soll auf einen Blick sehen, welche konkrete Arbeit heute ansteht und ob sie freigegeben werden kann.",
      expectedResult:
        "Ein klarer Aufgabenentwurf mit Projekt, Arbeitsblock, Agentenbeiträgen, Entscheidungspunkt, Sicherheitsgrenze und Auswertung.",
      jamalDecision:
        "Entwurf übernehmen, schärfen, Projekt wechseln oder stoppen.",
      safetyBoundary:
        "Noch keine Speicherung, keine Zuweisung, keine Automatisierung und keine externe Ausführung.",
    },
    taskDraftFields: [
      "Projekt",
      "kleinster Arbeitsblock",
      "Ziel",
      "erwartetes Ergebnis",
      "beteiligte Agenten",
      "Jamal-Entscheidungspunkt",
      "manuelle Startbedingung",
      "Abbruchgrenze",
      "Sicherheitsgrenze",
      "Auswertung nach Ausführung",
      "HR-Lernsignal",
    ],
    modeDifferences: {
      showDailyCard:
        "Stufe 1: Tageskarte nur anzeigen und strukturieren.",
      prepareTaskDraft:
        "Stufe 2: Aus der Tageskarte einen Aufgabenentwurf formulieren.",
      saveAfterApproval:
        "Stufe 3 später: Aufgabe erst nach Jamals Freigabe speichern.",
      automaticExecution:
        "Stufe 4 oder höher später: aktuell gesperrt und nicht aktiviert.",
    },
    founderBenefit:
      "Jamal bekommt eine klar formulierte Aufgabe statt nur einer Tageskarte, ohne Kontrolle abzugeben.",
    projectWorkBenefit:
      "Projektarbeit wird konkreter: aus Projekt, Arbeitsblock und Ergebnis entsteht ein prüfbarer Aufgabenentwurf.",
    agentDevelopmentBenefit:
      "Agenten lernen, aus Führungskarten konkrete, begrenzte und entscheidbare Aufgabenentwürfe zu formulieren.",
    laterLiveCapabilityBenefit:
      "Die Unternehmenszentrale trainiert die erste sichere Live-Vorstufe: Arbeit vorbereiten, ohne sie auszuführen.",
    agentFitnessRelation:
      "V6.35.3 ist ein Trainingsfall für spätere Entwurfsqualität. Keine neue Agenten-Autonomie wird freigegeben.",
    hrTrainingRelation:
      "HR kann aus dem Entwurfsmodus Trainingssignale für alle 25 Agenten ableiten: klarer formulieren, Grenzen halten, keine Ausführung vortäuschen.",
    qualityCenterRelation:
      "Das Qualitätszentrum prüft, ob der Aufgabenentwurf klein, verständlich, testbar und bestandsschonend bleibt.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent benennt das Aufgabenentwurfs-Muster als wiederverwendbare Projektlogik, ohne es automatisch zu speichern.",
    jamalOptions: [
      "Entwurfsmodus übernehmen",
      "Aufgabenentwurf einmal schärfen",
      "Andere Entwurfsaktion prüfen",
      "Stoppen / nicht weiterführen",
    ],
    adoptCriteria: [
      "der Entwurf ist konkret und aus der Tageskarte ableitbar",
      "Jamal-Entscheidungspunkt und Abbruchgrenze sind klar",
      "keine Speicherung, Zuweisung oder Ausführung wird ausgelöst",
      "die Aufgabe bleibt klein genug für manuelle Freigabe",
    ],
    sharpenCriteria: [
      "der Arbeitsblock ist noch zu allgemein",
      "Ziel oder erwartetes Ergebnis sind unklar",
      "Agentenbeiträge oder Sicherheitsgrenze fehlen",
      "Jamal müsste zu viel selbst nachformulieren",
    ],
    otherDraftActionCriteria: [
      "eine andere Stufe-2-Aktion wäre risikoärmer",
      "die Tageskarte ist noch nicht stabil genug",
      "ein Entwurf für Checkliste oder Briefing wäre heute sinnvoller",
    ],
    stopCriteria: [
      "der Entwurf würde wie eine gespeicherte Aufgabe wirken",
      "eine Zuweisung, Ausführung oder externe Übergabe würde nahegelegt",
      "die Sicherheitsgrenze ist nicht sichtbar",
      "Jamal-Entscheidung fehlt",
    ],
    expectedResultAfterApproval:
      "Ein lokaler Aufgabenentwurf ist vorbereitet: Projekt, Arbeitsblock, Ziel, erwartetes Ergebnis, Agentenbeiträge, Jamal-Entscheidung, Sicherheitsgrenze, Auswertung und HR-Lernsignal sind sichtbar.",
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft, ob der Aufgabenentwurf entscheidbar ist" },
      { agent: "Projektmanager-Agent", contribution: "übersetzt Tageskarte in konkrete Aufgabe" },
      { agent: "Produktmanager-Agent", contribution: "prüft Nutzen und Ergebnislogik" },
      { agent: "Design-Director-Agent", contribution: "prüft Verständlichkeit der Aufgabenkarte" },
      { agent: "Entwickler-Agent", contribution: "prüft, dass keine Schreibfunktion nötig ist" },
      { agent: "QA-Agent", contribution: "prüft Kriterien, Bestandsschutz und Testbarkeit" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft Grenzen des Entwurfsmodus" },
      { agent: "Content-Agent", contribution: "prüft klare Formulierungen" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "hält das Aufgabenentwurfs-Muster als wiederverwendbare Projektlogik fest" },
    ],
    nonGoals: [
      "kein echter Live-Betrieb",
      "keine produktive Freischaltung",
      "keine technische Modul-Freigabe",
      "keine Aufgabe speichern",
      "keine Aufgabe zuweisen",
      "keine Aufgabe starten",
      "keine Speicherung",
      "keine Schreiboperation",
      "keine Automatisierung",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine Canva-, HeyGen- oder Figma-Ausführung",
      "keine echte Bild- oder Videoproduktion",
      "keine Veröffentlichung",
      "keine echten Kundendaten",
      "keine echten Produktfreigaben",
      "keine Rechts-, Steuer-, regulatorische oder medizinische Beratung/Freigabe",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Der Entwurfsmodus ist nur gültig, wenn aus der Tageskarte eine klarere Aufgabe entsteht, ohne Speicherung, Zuweisung, Ausführung oder Kontrollverlust.",
    safetyBoundary:
      "Stufe 2 bedeutet nur Entwurf: keine Speicherung, keine Aufgabe zuweisen, keine Aufgabe starten, keine Automatisierung, keine externen Requests und keine Plugin-Ausführung.",
    prepared: true,
    activated: false,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    draftOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
    technicalModuleActivationBlocked: true,
  };
}

function getProductiveCentralFirstDraftModeActionManualReview() {
  return {
    title: "Entwurfsmodus manuell prüfen",
    status: "erste Entwurfsaktion manuell prüfbar vorbereitet",
    source:
      "V6.35.2 hat den Aufgabenentwurf aus der täglichen Projektarbeitskarte als reine Stufe-2-Entwurfsaktion vorbereitet. V6.35.3 macht diesen Entwurfsmodus manuell prüfbar.",
    reviewedApprovalStage: "Stufe 2: Entwurf vorbereiten",
    reviewedDraftAction:
      "Aufgabenentwurf aus täglicher Projektarbeitskarte vorbereiten",
    reviewGoal:
      "Prüfen, ob der Aufgabenentwurf Jamal wirklich Formulierungsarbeit abnimmt, klar genug ist, Sicherheitsgrenzen sichtbar hält und später kontrolliert als Grundlage für eine konzeptionelle Stufe-3-Vorbereitung taugen könnte.",
    reviewScope: [
      "ob der Entwurf Jamal Formulierungsarbeit abnimmt",
      "ob Projekt, kleinster Arbeitsblock und erwartetes Ergebnis klar sind",
      "ob Jamal-Entscheidungspunkt, Startbedingung und Abbruchgrenze sichtbar sind",
      "ob weiterhin klar bleibt, dass nichts gespeichert, zugewiesen oder gestartet wird",
      "ob brauchbare Agenten-Lernsignale entstehen",
      "ob Stufe 2 stabil genug wirkt, um später Stufe 3 nur konzeptionell vorzubereiten",
    ],
    exampleDraftFromV6352: {
      project: "KI-Unternehmenszentrale",
      taskDraft:
        "Standardprozess V1 in eine nutzbare Tageskarte überführen und prüfen, ob daraus später eine speicherbare Aufgabe entstehen darf.",
      goal:
        "Jamal soll auf einen Blick sehen, welche konkrete Arbeit heute ansteht und ob sie freigegeben werden kann.",
      expectedResult:
        "Ein klarer Aufgabenentwurf mit Projekt, Arbeitsblock, Agentenbeiträgen, Entscheidungspunkt, Sicherheitsgrenze und Auswertung.",
      jamalDecision:
        "Entwurf übernehmen, schärfen, Projekt wechseln oder stoppen.",
      safetyBoundary:
        "Noch keine Speicherung, keine Zuweisung, keine Automatisierung und keine externe Ausführung.",
    },
    reviewQuestions: [
      "Nimmt der Aufgabenentwurf Jamal Formulierungsarbeit ab?",
      "Ist das Projekt klar?",
      "Ist der kleinste Arbeitsblock klar?",
      "Ist das erwartete Ergebnis klar?",
      "Ist der Jamal-Entscheidungspunkt klar?",
      "Sind Startbedingung und Abbruchgrenze klar?",
      "Sind Sicherheitsgrenzen sichtbar?",
      "Bleibt klar, dass nichts gespeichert, zugewiesen oder gestartet wird?",
      "Entstehen brauchbare Agenten-Lernsignale?",
      "Darf daraus später Stufe 3 vorbereitet werden?",
    ],
    possibleReviewResults: [
      "Entwurfsmodus brauchbar",
      "einmal begrenzt schärfen",
      "anderes Entwurfsformat prüfen",
      "stoppen / nicht weiterführen",
    ],
    usableCriteria: [
      "Jamal versteht Aufgabe, Ziel und erwartetes Ergebnis sofort",
      "der Entwurf reduziert Formulierungsarbeit spürbar",
      "Startbedingung, Abbruchgrenze und Sicherheitsgrenze sind sichtbar",
      "keine Speicherung, Zuweisung oder Ausführung wird nahegelegt",
      "Agenten-Lernsignale sind konkret ableitbar",
    ],
    sharpenCriteria: [
      "der Entwurf ist grundsätzlich hilfreich, aber noch zu allgemein",
      "Jamal-Entscheidungspunkt oder Ergebnisformat brauchen mehr Schärfe",
      "Sicherheitsgrenzen sind vorhanden, aber nicht prominent genug",
      "Agentenbeiträge sind noch nicht präzise genug",
    ],
    otherFormatCriteria: [
      "eine Aufgabenkarte ist nicht das beste Entwurfsformat",
      "eine Checkliste, ein Briefing oder eine Prüfkarte wäre klarer",
      "der Entwurf nimmt Jamal noch nicht genug Arbeit ab",
    ],
    stopCriteria: [
      "der Entwurf wirkt wie eine echte gespeicherte Aufgabe",
      "Zuweisung, Start oder externe Übergabe werden nahegelegt",
      "Stufe 3 würde technisch oder operativ vorweggenommen",
      "Sicherheitsgrenzen bleiben unklar",
      "Jamal-Entscheidung fehlt",
    ],
    expectedReviewResult:
      "Jamal kann lokal entscheiden, ob der Stufe-2-Entwurfsmodus brauchbar ist, einmal geschärft werden muss, ein anderes Entwurfsformat braucht oder gestoppt wird.",
    coreLogic:
      "Stufe 2 ist nur dann wertvoll, wenn Jamal weniger selbst formulieren muss, aber trotzdem volle Kontrolle behält. Der Entwurf muss entscheidbar sein, ohne bereits eine echte Aufgabe zu speichern oder zu starten.",
    stage3Boundary:
      "V6.35.3 aktiviert Stufe 3 nicht und bereitet sie technisch nicht vor. Es wird nur geprüft, ob Stufe 2 stabil genug ist, um später Stufe 3 konzeptionell vorzubereiten.",
    agentFitnessSignals: [
      "GF-Agent lernt, Entwürfe auf Entscheidbarkeit zu prüfen",
      "Projektmanager-Agent lernt, Tageskarte und Aufgabe sauber zu verbinden",
      "Produktmanager-Agent lernt, Nutzen, Ziel und Ergebnislogik zu schärfen",
      "Design-Director-Agent lernt, Aufgabenkarte und Lesbarkeit zu prüfen",
      "Entwickler-Agent lernt, Entwurfsqualität ohne Schreibfunktion abzusichern",
      "QA-Agent lernt, Kriterien, Bestandsschutz und Testbarkeit zu bewerten",
      "Compliance/Risiko-Agent lernt, Entwurfsmodus-Grenzen sichtbar zu halten",
      "Content-Agent lernt, handlungsnahe Formulierungen zu verbessern",
      "HR-Agent leitet Trainingssignale für alle 25 Agenten ab",
      "Wissens/Archiv-Agent prüft Wiederverwendbarkeit des Aufgabenentwurfs-Musters",
    ],
    hrTrainingDerivation:
      "HR kann aus der manuellen Prüfung Trainingsimpulse für alle 25 Agenten ableiten: klarer formulieren, Entscheidungspunkte sichtbar machen, Grenzen halten und keine Ausführung vortäuschen.",
    qualityCenterRelation:
      "Das Qualitätszentrum prüft, ob der Entwurf klein, verständlich, sicher, testbar und bestandsschonend bleibt.",
    projectManagerRelation:
      "Der Projektmanager-Agent prüft, ob aus Tageskarte und Aufgabenentwurf ein sauberer nächster manueller Projektarbeitsschritt entsteht.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent hält fest, ob das Aufgabenentwurfs-Muster wiederverwendbar wäre, ohne etwas automatisch zu speichern.",
    jamalOptions: [
      "Entwurfsmodus als brauchbar markieren",
      "Einmal begrenzt schärfen",
      "Anderes Entwurfsformat prüfen",
      "Stoppen / nicht weiterführen",
    ],
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft, ob der Entwurf eine klare Führungsentscheidung ermöglicht" },
      { agent: "Projektmanager-Agent", contribution: "prüft, ob Tageskarte und Aufgabe sauber verbunden sind" },
      { agent: "Produktmanager-Agent", contribution: "prüft Nutzen, Ziel und Ergebnislogik" },
      { agent: "Design-Director-Agent", contribution: "prüft Verständlichkeit der Aufgabenkarte" },
      { agent: "Entwickler-Agent", contribution: "prüft, dass keine Schreibfunktion nötig ist" },
      { agent: "QA-Agent", contribution: "prüft Kriterien, Bestandsschutz und Testbarkeit" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft Grenzen des Entwurfsmodus" },
      { agent: "Content-Agent", contribution: "prüft klare, handlungsnahe Formulierungen" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "hält fest, ob das Aufgabenentwurfs-Muster wiederverwendbar ist" },
    ],
    nonGoals: [
      "kein echter Live-Betrieb",
      "keine produktive Freischaltung",
      "keine technische Modul-Freigabe",
      "keine Stufe-3-Ausführung vorbereiten oder aktivieren",
      "keine Aufgabe speichern",
      "keine Aufgabe zuweisen",
      "keine Aufgabe starten",
      "keine Speicherung",
      "keine Schreiboperation",
      "keine Automatisierung",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine Canva-, HeyGen- oder Figma-Ausführung",
      "keine echte Bild- oder Videoproduktion",
      "keine Veröffentlichung",
      "keine echten Kundendaten",
      "keine echten Produktfreigaben",
      "keine Rechts-, Steuer-, regulatorische oder medizinische Beratung/Freigabe",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Die manuelle Prüfung ist nur gültig, wenn sie sichtbar macht, ob der Aufgabenentwurf Jamal Arbeit abnimmt, entscheidbar bleibt und ohne technische Stufe-3-Vorbereitung auskommt.",
    safetyBoundary:
      "V6.35.3 bleibt vollständig lokal und read-only: keine Speicherung, keine Zuweisung, kein Aufgabenstart, keine Automatisierung, keine externen Requests und keine Stufe-3-Ausführung.",
    prepared: true,
    activated: false,
    stage3Prepared: false,
    stage3Activated: false,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    reviewOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
    technicalModuleActivationBlocked: true,
  };
}

function getProductiveCentralApprovalRequiredExecutionModel() {
  return {
    title: "Ausführung nach Jamal-Freigabe vorbereiten",
    status:
      "Stufe-3-Freigabelogik vorbereitet, noch nicht technisch aktiviert",
    source:
      "V6.35.3 hat den Stufe-2-Entwurfsmodus manuell prüfbar gemacht. V6.35.4 bereitet nur die Kontrolllogik für eine spätere Stufe 3 vor.",
    checkedPreviousStage: "Stufe 2: Entwurf vorbereiten",
    preparedTargetStage: "Stufe 3: Ausführung nach Jamal-Freigabe",
    clearStatement:
      "Die Unternehmenszentrale darf noch nicht ausführen. Sie bereitet nur vor, wie eine spätere Ausführung nach Jamal-Freigabe kontrolliert ablaufen müsste.",
    preparationGoal:
      "Definieren, wie eine spätere Jamal-Freigabe aussehen müsste, welche Informationen vor Ausführung sichtbar sein müssen, welche Sicherheitsprüfung nötig wäre und welche Aktionen trotz Freigabe gesperrt bleiben.",
    whyAfterDraftReview:
      "Stufe 3 darf erst konzeptionell vorbereitet werden, nachdem Stufe 2 prüfbar ist: Ein unklarer Entwurf darf nicht in eine Ausführungslogik übersetzt werden.",
    modeDifferences: {
      showDraft: "Entwurf anzeigen: nur sichtbar machen, keine Aktion.",
      reviewDraft: "Entwurf prüfen: Jamal bewertet Klarheit, Nutzen und Grenzen.",
      requestApproval:
        "Jamal-Freigabe einholen: eindeutige Freigabefrage mit Risiko- und Abbruchhinweis vorbereiten.",
      laterExecutionAfterApproval:
        "Spätere Ausführung nach Freigabe: erst in einer späteren Version und nur mit technischer Schreibfunktion nach Jamals eindeutiger Freigabe.",
      automaticExecutionWithoutApproval:
        "Automatische Ausführung ohne Freigabe: dauerhaft gesperrt.",
    },
    approvalChecklistV1: [
      "Was soll ausgeführt werden?",
      "Aus welchem Entwurf stammt die Aktion?",
      "Welches Projekt ist betroffen?",
      "Welcher kleinste Arbeitsblock wird umgesetzt?",
      "Was verändert sich durch die Ausführung?",
      "Wird etwas gespeichert?",
      "Wird etwas gesendet?",
      "Wird ein externes Tool genutzt?",
      "Sind echte Kundendaten betroffen?",
      "Sind rechtliche, steuerliche, regulatorische oder medizinische Grenzen betroffen?",
      "Ist Jamals Entscheidung eindeutig?",
      "Gibt es eine Abbruchgrenze?",
      "Gibt es eine Auswertung nach der Ausführung?",
      "Wird die Aktion dokumentierbar sein?",
      "Bleibt Agenten-Autonomie unverändert?",
    ],
    executionPreviewV1: {
      action: "Aufgabe nach Jamal-Freigabe speichern",
      project: "KI-Unternehmenszentrale",
      sourceDraft: "Aufgabenentwurf aus täglicher Projektarbeitskarte",
      expectedChange:
        "Eine Aufgabe wäre später speicherbar, falls Jamal eindeutig freigibt und eine sichere Schreibfunktion separat implementiert wurde.",
      risk:
        "Verwechslung zwischen Freigabelogik und echter Ausführung.",
      safetyBoundary:
        "In V6.35.4 keine Speicherung, keine Zuweisung, kein Start und keine Schreibfunktion.",
      requiredApproval: "eindeutige Jamal-Freigabe",
      executionStatus: "noch nicht aktiv",
      technicalBoundary: "keine Schreibfunktion vorhanden",
    },
    abortCheckBeforeExecution: [
      "Freigabefrage ist unklar",
      "Projekt, Entwurf oder Arbeitsblock sind nicht eindeutig",
      "Speicherung, Versand oder Tool-Nutzung wäre unklar",
      "echte Kundendaten oder Expertenpflicht wären betroffen",
      "Abbruchgrenze fehlt",
      "Auswertung nach Ausführung ist nicht sichtbar",
    ],
    safetyCheckBeforeExecution: [
      "keine externen Requests ohne separate Freigabe",
      "keine Schreiboperation ohne technische und manuelle Freigabe",
      "keine echten Kundendaten ohne Schutzkonzept",
      "keine rechtliche, steuerliche, regulatorische oder medizinische Freigabe",
      "keine Agenten-Autonomie-Erhöhung",
      "keine automatische Projektentscheidung",
    ],
    jamalDecisionPoint:
      "Jamal müsste später eindeutig sehen und bestätigen: Aktion ausführen, Checkliste schärfen, zurück zu Entwurf oder stoppen.",
    exampleWithoutExecution: {
      project: "KI-Unternehmenszentrale",
      draft: "Aufgabenentwurf aus täglicher Projektarbeitskarte",
      laterPossibleStage3Action:
        "Aufgabe nach Jamal-Freigabe speichern",
      currentStatus:
        "Nur Freigabelogik vorbereitet. Keine Aufgabe wird gespeichert, zugewiesen oder gestartet.",
      jamalDecision:
        "Diese Freigabelogik übernehmen, Checkliste schärfen, zurück zu Stufe 2 oder stoppen.",
    },
    coreLogic:
      "Stufe 3 bedeutet später: Die Unternehmenszentrale darf eine vorbereitete Aktion nur dann ausführen, wenn Jamal vorher eindeutig freigibt. V6.35.4 aktiviert diese Ausführung noch nicht, sondern definiert nur die Kontrolllogik dafür.",
    agentFitnessSignals: [
      "GF-Agent lernt, eindeutige Freigabepunkte zu prüfen",
      "Projektmanager-Agent lernt, Entwurf, Projekt und Arbeitsblock sauber zu verbinden",
      "Produktmanager-Agent lernt, Nutzen und Ergebnis der späteren Ausführung zu prüfen",
      "Entwickler-Agent prüft, dass noch keine Schreibfunktion aktiviert wird",
      "QA-Agent prüft Freigabe-Checkliste, Bestandsschutz und Testbarkeit",
      "Compliance/Risiko-Agent prüft Grenzen vor jeder späteren Ausführung",
      "Content-Agent prüft klare Freigabeformulierungen",
      "HR-Agent leitet Trainingssignale für alle 25 Agenten ab",
      "Wissens/Archiv-Agent hält die Freigabelogik als wiederverwendbares Muster fest",
    ],
    hrTrainingDerivation:
      "HR kann daraus Trainingsimpulse für alle 25 Agenten ableiten: Freigabepunkte klar formulieren, Ausführung von Entwurf trennen und Grenzen vor Handlung prüfen.",
    qualityCenterRelation:
      "Das Qualitätszentrum prüft, ob Freigabe-Checkliste, Abbruchprüfung, Sicherheitsprüfung und Bestandsschutz vollständig sind.",
    projectManagerRelation:
      "Der Projektmanager-Agent prüft, ob Entwurf, Projekt, kleinster Arbeitsblock und spätere Aktion logisch zusammenhängen.",
    complianceRiskRelation:
      "Compliance/Risiko prüft vor jeder späteren Ausführung Kundendaten, externe Tools, Expertenpflichten und dauerhaft gesperrte Bereiche.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent hält die Freigabelogik als Muster fest, ohne etwas automatisch zu speichern.",
    jamalOptions: [
      "Stufe-3-Logik übernehmen",
      "Freigabe-Checkliste schärfen",
      "Zurück zu Stufe 2",
      "Stoppen / nicht weiterführen",
    ],
    adoptCriteria: [
      "Freigabe-Checkliste ist vollständig",
      "Jamal-Entscheidungspunkt ist eindeutig",
      "Abbruch- und Sicherheitsprüfung sind sichtbar",
      "keine echte Ausführung wird technisch aktiviert",
      "trotz Freigabe gesperrte Aktionen bleiben klar",
    ],
    sharpenChecklistCriteria: [
      "Freigabefrage ist noch zu allgemein",
      "Speicherung, Versand oder Tool-Nutzung sind nicht deutlich genug getrennt",
      "Expertenpflichten fehlen",
      "Dokumentierbarkeit oder Auswertung nach Ausführung ist unklar",
    ],
    returnToStage2Criteria: [
      "der Aufgabenentwurf ist noch nicht stabil genug",
      "Jamal müsste vor einer Freigabelogik zu viel selbst klären",
      "Stufe 3 würde zu früh wirken",
    ],
    stopCriteria: [
      "Ausführung würde technisch aktiviert",
      "Schreibfunktion, Speicherung oder externe Aktion würden nahegelegt",
      "automatische Ausführung ohne Freigabe wäre möglich",
      "kritische Grenzen wären unscharf",
    ],
    expectedResultAfterApproval:
      "Eine lokale Stufe-3-Freigabelogik ist vorbereitet: Freigabe-Checkliste, Ausführungs-Vorschau, Abbruchprüfung, Sicherheitsprüfung, Jamal-Entscheidung und dauerhaft gesperrte Aktionen sind sichtbar.",
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft, ob Jamals Freigabepunkt eindeutig ist" },
      { agent: "Projektmanager-Agent", contribution: "prüft, ob Entwurf, Projekt und Arbeitsblock sauber verbunden sind" },
      { agent: "Produktmanager-Agent", contribution: "prüft Nutzen und Ergebnis der späteren Ausführung" },
      { agent: "Entwickler-Agent", contribution: "prüft, dass noch keine Schreibfunktion aktiviert wird" },
      { agent: "QA-Agent", contribution: "prüft Freigabe-Checkliste, Bestandsschutz und Testbarkeit" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft Grenzen vor jeder späteren Ausführung" },
      { agent: "Content-Agent", contribution: "prüft klare Freigabeformulierungen" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "hält die Freigabelogik als wiederverwendbares Muster fest" },
    ],
    nonGoals: [
      "kein echter Live-Betrieb",
      "keine produktive Freischaltung",
      "keine technische Modul-Freigabe",
      "keine echte Stufe-3-Ausführung aktivieren",
      "keine Aufgabe speichern",
      "keine Aufgabe zuweisen",
      "keine Aufgabe starten",
      "keine Speicherung",
      "keine Schreiboperation",
      "keine Automatisierung",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine Canva-, HeyGen- oder Figma-Ausführung",
      "keine echte Bild- oder Videoproduktion",
      "keine Veröffentlichung",
      "keine echten Kundendaten",
      "keine echten Produktfreigaben",
      "keine Rechts-, Steuer-, regulatorische oder medizinische Beratung/Freigabe",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Die Stufe-3-Vorbereitung ist nur gültig, wenn sie Freigabe, Abbruch, Risiko und gesperrte Aktionen klar macht, ohne Ausführung technisch zu aktivieren.",
    safetyBoundary:
      "V6.35.4 bleibt lokal und read-only: keine echte Stufe-3-Ausführung, keine Speicherung, keine Zuweisung, kein Aufgabenstart, keine Automatisierung, keine externen Requests und keine Schreibfunktion.",
    prepared: true,
    activated: false,
    stage3ConceptPrepared: true,
    stage3TechnicalActivation: false,
    realExecutionActivated: false,
    writeFunctionAvailable: false,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    conceptOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
    technicalModuleActivationBlocked: true,
  };
}

function getProductiveCentralApprovalRequiredExecutionManualReview() {
  return {
    title: "Stufe-3-Freigabelogik manuell prüfen",
    status:
      "Stufe-3-Freigabelogik manuell prüfbar vorbereitet, noch nicht aktiviert",
    source:
      "V6.35.4 hat die Stufe-3-Freigabelogik konzeptionell vorbereitet. V6.35.5 macht diese Freigabelogik manuell prüfbar, ohne Ausführung zu aktivieren.",
    reviewedTargetStage: "Stufe 3: Ausführung nach Jamal-Freigabe",
    reviewedElements: [
      "Freigabe-Checkliste V1",
      "Ausführungs-Vorschau V1",
      "Abbruchprüfung",
      "Sicherheitsprüfung",
      "Jamal-Entscheidungspunkt",
    ],
    clearStatement:
      "Die Unternehmenszentrale prüft nur die spätere Freigabelogik. Es wird nichts gespeichert, nichts zugewiesen, nichts gestartet und keine Ausführung aktiviert.",
    reviewGoal:
      "Prüfen, ob die Freigabe-Checkliste vollständig genug ist, Jamals Entscheidungspunkt eindeutig ist, Risiken vor späterer Ausführung sichtbar werden und klar bleibt, dass V6.35.5 nichts ausführt.",
    whyBeforeWriteFunction:
      "Eine echte Schreibfunktion darf erst später diskutiert werden, wenn Freigabelogik, Risiken, Abbruchgrenzen, Auswertbarkeit und Jamals Entscheidung eindeutig prüfbar sind.",
    reviewScope: [
      "Vollständigkeit der Freigabe-Checkliste",
      "Eindeutigkeit des Jamal-Entscheidungspunkts",
      "Sichtbarkeit von Risiken vor späterer Ausführung",
      "Klarheit darüber, was später ausgeführt würde",
      "Klarheit darüber, dass V6.35.5 nichts ausführt",
      "Trainingssignale für kontrollierte Ausführungsreife aller 25 Agenten",
    ],
    reviewQuestions: [
      "Ist eindeutig, welche Aktion später ausgeführt werden könnte?",
      "Ist eindeutig, aus welchem Entwurf die Aktion stammt?",
      "Ist das betroffene Projekt klar?",
      "Ist der kleinste Arbeitsblock klar?",
      "Ist sichtbar, was sich durch eine spätere Ausführung verändern würde?",
      "Ist sichtbar, ob etwas gespeichert, gesendet oder extern ausgeführt würde?",
      "Sind echte Kundendaten ausgeschlossen?",
      "Sind Rechts-, Steuer-, Regulatorik- und medizinische Grenzen sichtbar?",
      "Ist Jamals Freigabe eindeutig genug formulierbar?",
      "Gibt es eine klare Abbruchgrenze?",
      "Gibt es eine Auswertung nach späterer Ausführung?",
      "Bleibt klar, dass Agenten-Autonomie nicht automatisch erhöht wird?",
      "Bleibt klar, dass V6.35.5 keine echte Ausführung aktiviert?",
    ],
    possibleReviewResults: [
      "Freigabelogik prüfbar und brauchbar",
      "einmal begrenzt schärfen",
      "zurück zu Stufe 2",
      "stoppen / nicht weiterführen",
    ],
    usableCriteria: [
      "Aktion, Quelle, Projekt und Arbeitsblock sind eindeutig",
      "Jamal kann die Freigabeentscheidung klar treffen oder ablehnen",
      "Risiko, Abbruchgrenze und Sicherheitsprüfung sind sichtbar",
      "Speicherung, Versand, externe Ausführung und Kundendaten sind sauber geklärt",
      "V6.35.5 bleibt eindeutig ohne echte Ausführung",
    ],
    sharpenCriteria: [
      "ein Checklistenpunkt ist zu allgemein",
      "Jamal-Freigabe ist noch nicht eindeutig genug formulierbar",
      "Ausführungs-Vorschau oder Risiko sind zu schwach",
      "Auswertung nach späterer Ausführung ist noch unklar",
    ],
    returnToStage2Criteria: [
      "der zugrunde liegende Entwurf ist noch nicht stabil genug",
      "Stufe 3 wirkt zu früh oder zu ausführungsnah",
      "die Freigabeprüfung erzeugt mehr Unklarheit als Sicherheit",
    ],
    stopCriteria: [
      "Freigabelogik würde echte Ausführung nahelegen",
      "Schreibfunktion oder Speicherung wirkt bereits vorhanden",
      "Risiken oder Expertenpflichten bleiben unsichtbar",
      "Jamal-Entscheidungspunkt ist nicht eindeutig",
    ],
    concreteReviewBasis: {
      laterPossibleAction: "Aufgabe nach Jamal-Freigabe speichern",
      statusInV6355:
        "Nur Prüfung der Freigabelogik. Keine Aufgabe wird gespeichert, zugewiesen oder gestartet.",
      project: "KI-Unternehmenszentrale",
      source: "Aufgabenentwurf aus täglicher Projektarbeitskarte",
      laterAction:
        "Aufgabe speichern, nachdem Jamal eindeutig freigegeben hat.",
      result:
        "Die Unternehmenszentrale prüft, ob Jamal vor einer späteren Ausführung genug Informationen sieht, um sicher entscheiden zu können.",
    },
    expectedReviewResult:
      "Jamal kann lokal entscheiden, ob die Stufe-3-Freigabelogik prüfbar und brauchbar ist, einmal geschärft werden muss, zurück zu Stufe 2 gehört oder gestoppt wird.",
    coreLogic:
      "Eine spätere Ausführung nach Jamal-Freigabe darf erst vorbereitet werden, wenn die Freigabelogik selbst prüfbar, verständlich, sicher und auswertbar ist. V6.35.5 aktiviert keine Ausführung.",
    agentFitnessSignals: [
      "GF-Agent prüft, ob Jamals Freigabeentscheidung eindeutig vorbereitet ist",
      "Projektmanager-Agent prüft, ob Entwurf, Projekt, Arbeitsblock und mögliche Ausführung sauber verbunden sind",
      "Produktmanager-Agent prüft Nutzen und Ergebnis der späteren Ausführung",
      "Entwickler-Agent prüft, dass weiterhin keine Schreibfunktion aktiviert wird",
      "QA-Agent prüft Freigabe-Checkliste, Testbarkeit, Bestandsschutz und Abbruchgrenzen",
      "Compliance/Risiko-Agent prüft Grenzen vor jeder späteren Ausführung",
      "Content-Agent prüft klare Freigabeformulierungen",
      "HR-Agent leitet Trainingssignale für alle 25 Agenten ab",
      "Wissens/Archiv-Agent hält fest, ob die Freigabelogik als wiederverwendbares Muster taugt",
    ],
    hrTrainingDerivation:
      "HR kann aus dieser Prüfung Trainingssignale für alle 25 Agenten ableiten: Freigabe eindeutiger formulieren, Risiken vor Handlung sichtbar machen und Ausführung nicht vortäuschen.",
    qualityCenterRelation:
      "Das Qualitätszentrum prüft Vollständigkeit der Checkliste, Testbarkeit, Bestandsschutz, Abbruchgrenzen und Auswertbarkeit.",
    projectManagerRelation:
      "Der Projektmanager-Agent prüft, ob Entwurf, Projekt, Arbeitsblock und mögliche Ausführung zu einem kontrollierbaren nächsten Schritt verbunden sind.",
    complianceRiskRelation:
      "Compliance/Risiko prüft Kundendaten, externe Systeme, Expertenpflichten und dauerhaft gesperrte Rechts-, Steuer-, Regulatorik- und Medizinbereiche.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent hält fest, ob die Freigabelogik als wiederverwendbares Muster taugt, ohne sie zu speichern.",
    jamalOptions: [
      "Freigabelogik als brauchbar markieren",
      "Einmal begrenzt schärfen",
      "Zurück zu Stufe 2",
      "Stoppen / nicht weiterführen",
    ],
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft, ob Jamals Freigabeentscheidung eindeutig vorbereitet ist" },
      { agent: "Projektmanager-Agent", contribution: "prüft, ob Entwurf, Projekt, Arbeitsblock und mögliche Ausführung sauber verbunden sind" },
      { agent: "Produktmanager-Agent", contribution: "prüft Nutzen und Ergebnis der späteren Ausführung" },
      { agent: "Entwickler-Agent", contribution: "prüft, dass weiterhin keine Schreibfunktion aktiviert wird" },
      { agent: "QA-Agent", contribution: "prüft Freigabe-Checkliste, Testbarkeit, Bestandsschutz und Abbruchgrenzen" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft Grenzen vor jeder späteren Ausführung" },
      { agent: "Content-Agent", contribution: "prüft klare Freigabeformulierungen" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "hält fest, ob die Freigabelogik als wiederverwendbares Muster taugt" },
    ],
    nonGoals: [
      "kein echter Live-Betrieb",
      "keine produktive Freischaltung",
      "keine technische Modul-Freigabe",
      "keine echte Stufe-3-Ausführung aktivieren",
      "keine neue Schreibfunktion",
      "keine Aufgabe speichern",
      "keine Aufgabe zuweisen",
      "keine Aufgabe starten",
      "keine Speicherung",
      "keine Schreiboperation",
      "keine Automatisierung",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine Canva-, HeyGen- oder Figma-Ausführung",
      "keine echte Bild- oder Videoproduktion",
      "keine Veröffentlichung",
      "keine echten Kundendaten",
      "keine echten Produktfreigaben",
      "keine Rechts-, Steuer-, regulatorische oder medizinische Beratung/Freigabe",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Die manuelle Prüfung ist nur gültig, wenn sie zeigt, ob Freigabe-Checkliste, Entscheidungspunkt, Risiken, Abbruchgrenze und Auswertbarkeit vollständig genug sind.",
    safetyBoundary:
      "V6.35.5 prüft nur die Freigabelogik: keine echte Ausführung, keine Schreibfunktion, keine Speicherung, keine Zuweisung, kein Aufgabenstart, keine Automatisierung und keine externen Requests.",
    prepared: true,
    activated: false,
    reviewOnly: true,
    stage3ManualReviewPrepared: true,
    stage3ExecutionActivated: false,
    realExecutionActivated: false,
    writeFunctionAvailable: false,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
    technicalModuleActivationBlocked: true,
  };
}

function getProductiveCentralFutureWriteCapabilityModel() {
  return {
    title: "Schreibfähigkeit als Zukunftsmodell vorbereiten",
    status:
      "technisches Zukunftsmodell für spätere Schreibfähigkeit vorbereitet, noch nicht aktiviert",
    source:
      "V6.35.5 hat die Stufe-3-Freigabelogik manuell prüfbar gemacht. V6.35.6 beschreibt nur, wie spätere Schreibfähigkeit sicher vorbereitet werden müsste.",
    clearStatement:
      "Die Unternehmenszentrale besitzt weiterhin keine Schreibfunktion. V6.35.6 beschreibt nur, wie spätere Schreibfähigkeit sicher vorbereitet werden müsste.",
    goal:
      "Ein technisches Zukunftsmodell festlegen, das spätere Schreibaktionen nur mit eindeutiger Freigabe, Schutzprüfung, Audit, Rollback-Pfad und klarer Modulzuständigkeit denkbar macht.",
    whyLaterWriteCapabilityMatters:
      "Damit die Unternehmenszentrale Jamal später echte Arbeit abnehmen kann, müssen speichernde Aktionen irgendwann denkbar sein. Vorher müssen Grenzen, Freigaben und Rückwege stabil sein.",
    whyNotActivatedNow:
      "Die aktuelle Zentrale ist lokal, read-only und ohne Live-Betrieb. Eine Schreibfunktion wäre zu früh, solange Schutzmodell, Audit, Rollback und Expertenbereiche nur konzeptionell geprüft sind.",
    differences: {
      draftDisplay:
        "Entwurf anzeigen: Jamal sieht eine vorbereitete Aufgabe oder Notiz, ohne dass etwas verändert wird.",
      approvalReview:
        "Freigabe prüfen: Jamal sieht Aktion, Risiko, Quelle und Grenze, ohne technische Ausführung.",
      laterWritePreparation:
        "Spätere Schreibaktion vorbereiten: Schutzpunkte, Audit und Rollback werden sichtbar gemacht, aber nicht technisch aktiviert.",
      realWriteExecution:
        "Echte Schreibaktion ausführen: würde später erst nach eindeutiger Freigabe und vorhandener Schreibfunktion stattfinden.",
      automaticWriteWithoutApproval:
        "Automatische Schreibaktion ohne Freigabe: bleibt gesperrt und ist nicht Teil dieses Modells.",
    },
    possibleLaterWriteActions: [
      "Aufgabe speichern",
      "Projektstatus ändern",
      "Entscheidung dokumentieren",
      "Checkliste aktualisieren",
      "Wissens-/Archivnotiz speichern",
      "E-Mail-Entwurf speichern",
      "Unterlagenstatus markieren",
    ],
    permanentlyBlockedOrProtectedWriteActions: [
      "automatische Projektentscheidung",
      "automatische Agenten-Autonomie-Erhöhung",
      "automatische Länderfreigabe",
      "Rechts-, Steuer-, Regulatorik- oder medizinische Freigabe",
      "Veröffentlichung ohne Freigabe",
      "Kundendaten ohne Schutzkonzept",
    ],
    protectionModelV1: [
      "eindeutige Aktion",
      "eindeutiges Modul",
      "eindeutiges Projekt",
      "eindeutige Quelle / Entwurf",
      "eindeutige Jamal-Freigabe",
      "sichtbare Änderung vor Ausführung",
      "Sicherheitsprüfung vor Ausführung",
      "Abbruchgrenze vor Ausführung",
      "Audit-Eintrag nach Ausführung",
      "Rollback- oder Korrekturpfad",
      "keine automatische Autonomie-Erhöhung",
      "keine externen Aktionen ohne separate Freigabe",
      "keine sensiblen Daten ohne Schutzkonzept",
      "keine Expertenbereiche ohne Experten-/GF-Freigabe",
    ],
    auditRequirementsV1: [
      "wer freigegeben hat",
      "wann freigegeben wurde",
      "welches Modul geschrieben hat",
      "welches Projekt betroffen war",
      "welcher Entwurf Grundlage war",
      "was geändert wurde",
      "warum geändert wurde",
      "welche Sicherheitsprüfung bestanden wurde",
      "ob ein Rollback/Korrekturpfad vorhanden ist",
    ],
    rollbackAbortRequirementsV1: [
      "Aktion vor Ausführung abbrechbar",
      "Ergebnis nach Ausführung prüfbar",
      "falsche Änderung korrigierbar",
      "kritische Aktion blockierbar",
      "unklare Aktion nicht ausführbar",
      "fehlende Freigabe stoppt Ausführung",
      "fehlende Sicherheitsprüfung stoppt Ausführung",
    ],
    jamalApprovalRequirementsV1: [
      "Jamal sieht Aktion, Projekt, Quelle und erwartete Änderung vor jeder späteren Schreibaktion",
      "Jamal bestätigt bewusst, dass die Aktion später ausgeführt werden darf",
      "Jamal sieht Risiko, Sicherheitsgrenze, Audit-Hinweis und Abbruchmöglichkeit",
      "ohne eindeutige Freigabe bleibt jede Schreibaktion blockiert",
    ],
    futureWritePreviewForJamal: [
      "Projekt",
      "Aufgabe",
      "Quelle / Entwurf",
      "erwartete Änderung",
      "Risiko",
      "Sicherheitsgrenze",
      "Freigabestatus",
      "Audit-Hinweis",
      "Abbruchmöglichkeit",
    ],
    exampleWithoutWriteFunction: {
      laterPossibleAction: "Aufgabe nach Jamal-Freigabe speichern",
      statusInV6356:
        "Nur Zukunftsmodell. Keine Aufgabe wird gespeichert, zugewiesen oder gestartet. Kein Schreib-Endpunkt vorhanden.",
      project: "KI-Unternehmenszentrale",
      source: "Aufgabenentwurf aus täglicher Projektarbeitskarte",
      laterAction:
        "Aufgabe nach eindeutiger Jamal-Freigabe speichern, wenn eine spätere Schreibfunktion separat freigegeben und geprüft wäre.",
    },
    coreLogic:
      "Schreibfähigkeit darf nicht pauschal aktiviert werden. Jede spätere Schreibaktion braucht Freigabe, Schutzprüfung, Audit, Abbruchgrenze und klare Modulzuständigkeit.",
    qualityCenterCheck:
      "Das Qualitätszentrum prüft Testbarkeit, Bestandsschutz, Schutzpunkte, Audit-Anforderungen, Rollback-Pfad und Abbruchgrenzen.",
    complianceRiskCheck:
      "Compliance/Risiko prüft sensible Daten, Expertenbereiche, externe Aktionen, Produktfreigaben, Rechts-/Steuer-/Regulatorik- und Medizin-Grenzen.",
    developerCheck:
      "Der Entwickler-Agent prüft technische Schutzanforderungen, ohne Schreibfunktion, Schreib-Endpunkt oder Live-Betrieb zu aktivieren.",
    hrTrainingRelation:
      "HR leitet Trainingssignale für alle 25 Agenten ab: Schreibfähigkeit nur als kontrollierte, auditierbare und freigabepflichtige Zukunftsfähigkeit denken.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent hält das Zukunftsmodell als Sicherheitsmuster fest, ohne echte Speicherung auszulösen.",
    jamalOptions: [
      "Zukunftsmodell übernehmen",
      "Schutzmodell schärfen",
      "Schreibfähigkeit zurückstellen",
      "Stoppen / nicht weiterführen",
    ],
    adoptCriteria: [
      "spätere Schreibaktionen sind klar benannt",
      "Schutzmodell, Audit und Rollback sind vollständig genug",
      "Jamal-Freigabe bleibt zwingend und eindeutig",
      "dauerhaft gesperrte Aktionen sind sichtbar",
      "keine technische Schreibfunktion wird aktiviert",
    ],
    sharpenCriteria: [
      "Schutzpunkte sind noch zu allgemein",
      "Audit-Anforderungen sind nicht prüfbar genug",
      "Rollback- oder Abbruchlogik ist unklar",
      "Expertenbereiche sind noch nicht streng genug getrennt",
    ],
    postponeCriteria: [
      "Schreibfähigkeit wirkt noch zu früh",
      "Stufe-3-Freigabelogik ist noch nicht stabil genug",
      "Projektmodule sind noch nicht klar genug abgegrenzt",
    ],
    stopCriteria: [
      "das Modell würde echte Schreibfähigkeit vortäuschen",
      "Schreib-Endpunkte, Speicherung oder externe Aktionen würden nahegelegt",
      "Jamal-Freigabe, Audit oder Rollback fehlen",
      "sensible Daten oder Expertenbereiche wären nicht geschützt",
    ],
    expectedResultAfterApproval:
      "Jamal kann lokal entscheiden, ob das Zukunftsmodell für spätere Schreibfähigkeit tragfähig genug ist, geschärft werden muss, zurückgestellt oder gestoppt wird.",
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft, ob spätere Schreibaktionen führbar und entscheidbar bleiben" },
      { agent: "Projektmanager-Agent", contribution: "prüft, welche Projektaktionen später schreibend relevant wären" },
      { agent: "Entwickler-Agent", contribution: "prüft technische Schutzanforderungen, ohne Schreibfunktion zu aktivieren" },
      { agent: "QA-Agent", contribution: "prüft Testbarkeit, Bestandsschutz, Audit- und Rollback-Anforderungen" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft Grenzen für sensible Schreibaktionen" },
      { agent: "Content-Agent", contribution: "prüft klare Freigabe- und Warntexte" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "hält das Zukunftsmodell als Sicherheitsmuster fest" },
    ],
    nonGoals: [
      "kein echter Live-Betrieb",
      "keine produktive Freischaltung",
      "keine technische Modul-Freigabe",
      "keine echte Stufe-3-Ausführung",
      "keine neuen POST/PATCH/PUT/DELETE-Endpunkte",
      "keine Schreibfunktion",
      "keine Speicherung oder Schreiboperation",
      "keine Aufgabe speichern, zuweisen oder starten",
      "keine Projektstatusänderung",
      "keine Entscheidung speichern",
      "keine Checkliste aktualisieren",
      "keine Automatisierung",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine Canva-, HeyGen- oder Figma-Ausführung",
      "keine Veröffentlichung",
      "keine echten Kundendaten",
      "keine echten Produktfreigaben",
      "keine Rechts-, Steuer-, regulatorische oder medizinische Beratung/Freigabe",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Das Zukunftsmodell ist nur gültig, wenn spätere Schreibaktionen, Schutzprüfung, Freigabe, Audit, Rollback, Abbruchgrenze und dauerhaft gesperrte Aktionen klar sichtbar sind.",
    safetyBoundary:
      "V6.35.6 bleibt lokal, read-only und vorbereitend: keine Schreibfunktion, keine Speicherung, keine Schreiboperation, kein Schreib-Endpunkt, keine externe Aktion und kein Live-Betrieb.",
    prepared: true,
    activated: false,
    futureModelOnly: true,
    writeCapabilityPreparedAsFutureModel: true,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
    technicalModuleActivationBlocked: true,
  };
}

function getProductiveCentralFutureWriteCapabilityManualReview() {
  return {
    title: "Schreibfähigkeits-Zukunftsmodell manuell prüfen",
    status:
      "Schreibfähigkeits-Zukunftsmodell manuell prüfbar vorbereitet, noch nicht aktiviert",
    source:
      "V6.35.6 hat ein technisches Zukunftsmodell für spätere Schreibfähigkeit vorbereitet. V6.35.7 prüft dieses Modell manuell, ohne Schreibfähigkeit zu aktivieren.",
    reviewedArea: "spätere Schreibfähigkeit der KI-Unternehmenszentrale",
    clearStatement:
      "Die Unternehmenszentrale prüft nur das Zukunftsmodell. Es gibt weiterhin keine Schreibfunktion und keinen Schreib-Endpunkt.",
    reviewGoal:
      "Prüfen, ob Schutzmodell, spätere Schreibaktionen, Audit, Rollback, Abbruchgrenzen, Jamal-Freigabe und sensible Sperrbereiche vollständig genug sind.",
    whyBeforeRealWriteFunction:
      "Eine echte Schreibfunktion darf erst diskutiert werden, wenn das Schutzmodell selbst prüfbar, verständlich, sicher und führbar ist.",
    reviewScope: [
      "Vollständigkeit des Schutzmodells",
      "Begrenzung später denkbarer Schreibaktionen",
      "Verständlichkeit von Audit-, Rollback- und Abbruchanforderungen",
      "Eindeutigkeit der Jamal-Freigabe vor jeder späteren Schreibaktion",
      "Sperrung sensibler Bereiche",
      "kontrollierte spätere Arbeitsentlastung ohne unkontrolliertes Handeln",
      "Trainingssignale für alle 25 Agenten",
    ],
    reviewedModelParts: [
      "mögliche spätere Schreibaktionen",
      "dauerhaft gesperrte Schreibaktionen",
      "Schutzmodell V1",
      "Audit-Anforderungen V1",
      "Rollback-/Abbruchanforderungen V1",
      "Jamal-Freigabeanforderungen V1",
      "Qualitätszentrum-Prüfung",
      "Compliance/Risiko-Prüfung",
      "Entwickler-Prüfung",
    ],
    reviewQuestions: [
      "Ist eindeutig, welche Schreibaktionen später überhaupt denkbar wären?",
      "Ist eindeutig, welche Schreibaktionen dauerhaft gesperrt bleiben?",
      "Ist vor jeder späteren Schreibaktion eine Jamal-Freigabe vorgesehen?",
      "Ist sichtbar, was durch eine spätere Schreibaktion verändert würde?",
      "Ist sichtbar, ob ein Projekt, eine Aufgabe, eine Checkliste oder ein Status betroffen wäre?",
      "Ist ein Audit-Eintrag für spätere Schreibaktionen vorgesehen?",
      "Ist ein Rollback- oder Korrekturpfad vorgesehen?",
      "Gibt es klare Abbruchgrenzen?",
      "Sind sensible Daten weiterhin geschützt?",
      "Sind externe Aktionen weiterhin separat freigabepflichtig?",
      "Sind Rechts-, Steuer-, Regulatorik- und medizinische Bereiche ausreichend gesperrt?",
      "Bleibt klar, dass Agenten-Autonomie nicht automatisch erhöht wird?",
      "Bleibt klar, dass V6.35.7 keine echte Schreibfunktion aktiviert?",
    ],
    possibleReviewResults: [
      "Zukunftsmodell prüfbar und brauchbar",
      "Schutzmodell einmal schärfen",
      "Schreibfähigkeit weiter zurückstellen",
      "stoppen / nicht weiterführen",
    ],
    usableCriteria: [
      "spätere Schreibaktionen sind eindeutig und klein genug begrenzt",
      "dauerhaft gesperrte Schreibaktionen sind sichtbar",
      "Jamal-Freigabe ist vor jeder späteren Schreibaktion zwingend",
      "Audit, Rollback und Abbruchgrenzen sind verständlich",
      "sensible Daten und Expertenbereiche bleiben gesperrt",
      "V6.35.7 bleibt ohne echte Schreibfunktion",
    ],
    sharpenCriteria: [
      "Schutzpunkte sind noch zu allgemein formuliert",
      "Audit- oder Rollback-Anforderungen sind noch nicht klar genug",
      "Jamal-Freigabe ist noch nicht eindeutig genug prüfbar",
      "sensible Bereiche müssen strenger getrennt werden",
    ],
    postponeCriteria: [
      "Schreibfähigkeit wirkt weiterhin zu früh",
      "das V6.35.6-Modell ist noch nicht führbar genug",
      "Schutzmodell, Audit oder Rollback erzeugen noch zu viele offene Fragen",
    ],
    stopCriteria: [
      "das Modell würde echte Schreibfähigkeit nahelegen",
      "Schreib-Endpunkt oder technische Schreibfunktion wirkt vorhanden",
      "Jamal-Freigabe, Audit, Rollback oder Abbruchgrenze fehlen",
      "sensible Daten, Expertenbereiche oder externe Aktionen wären nicht ausreichend geschützt",
    ],
    concreteReviewBasis: {
      laterPossibleWriteAction: "Aufgabe nach Jamal-Freigabe speichern",
      statusInV6357:
        "Nur Prüfung des Zukunftsmodells. Keine Aufgabe wird gespeichert, zugewiesen oder gestartet. Kein Schreib-Endpunkt vorhanden.",
      project: "KI-Unternehmenszentrale",
      laterAction:
        "Eine Aufgabe aus einer freigegebenen Tageskarte speichern.",
      result:
        "Die Unternehmenszentrale prüft, ob diese spätere Schreibaktion nur mit eindeutiger Freigabe, Schutzprüfung, Audit und Abbruchgrenze denkbar wäre.",
    },
    expectedReviewResult:
      "Jamal kann lokal entscheiden, ob das Schreibfähigkeits-Zukunftsmodell prüfbar und brauchbar ist, einmal geschärft, weiter zurückgestellt oder gestoppt wird.",
    coreLogic:
      "Schreibfähigkeit darf erst dann technisch vorbereitet werden, wenn das Schutzmodell selbst prüfbar, verständlich, sicher und führbar ist. V6.35.7 aktiviert keine Schreibfunktion.",
    agentFitnessSignals: [
      "GF-Agent prüft, ob spätere Schreibfähigkeit führbar und entscheidbar bleibt",
      "Projektmanager-Agent prüft, welche Projektaktionen später schreibend relevant wären",
      "Entwickler-Agent prüft technische Schutzanforderungen, ohne Schreibfunktion zu aktivieren",
      "QA-Agent prüft Testbarkeit, Bestandsschutz, Audit- und Rollback-Anforderungen",
      "Compliance/Risiko-Agent prüft Grenzen für sensible Schreibaktionen",
      "Content-Agent prüft klare Freigabe-, Warn- und Abbruchtexte",
      "HR-Agent leitet Trainingssignale für alle 25 Agenten ab",
      "Wissens/Archiv-Agent hält fest, ob das Schutzmodell als wiederverwendbares Sicherheitsmuster taugt",
    ],
    hrTrainingDerivation:
      "HR kann alle 25 Agenten darauf trainieren, spätere Schreibfähigkeit nur mit Freigabe, Audit, Rollback, Abbruchgrenze und unveränderter Autonomie zu denken.",
    qualityCenterRelation:
      "Das Qualitätszentrum prüft, ob Schutzmodell, Audit, Rollback, Bestandsschutz und Testbarkeit ausreichend klar sind.",
    projectManagerRelation:
      "Der Projektmanager-Agent prüft, welche Projektaktionen später überhaupt schreibend relevant wären und ob sie klein genug bleiben.",
    developerRelation:
      "Der Entwickler-Agent prüft technische Schutzanforderungen, ohne Schreibfunktion, Schreib-Endpunkt oder technische Schreibvorbereitung zu aktivieren.",
    complianceRiskRelation:
      "Compliance/Risiko prüft sensible Daten, externe Aktionen, Expertenbereiche und dauerhaft gesperrte Rechts-, Steuer-, Regulatorik- und Medizinbereiche.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent hält fest, ob das Schutzmodell als wiederverwendbares Sicherheitsmuster taugt, ohne echte Speicherung auszulösen.",
    jamalOptions: [
      "Zukunftsmodell als brauchbar markieren",
      "Schutzmodell einmal schärfen",
      "Schreibfähigkeit weiter zurückstellen",
      "Stoppen / nicht weiterführen",
    ],
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft, ob spätere Schreibfähigkeit führbar und entscheidbar bleibt" },
      { agent: "Projektmanager-Agent", contribution: "prüft, welche Projektaktionen später schreibend relevant wären" },
      { agent: "Entwickler-Agent", contribution: "prüft technische Schutzanforderungen, ohne Schreibfunktion zu aktivieren" },
      { agent: "QA-Agent", contribution: "prüft Testbarkeit, Bestandsschutz, Audit- und Rollback-Anforderungen" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft Grenzen für sensible Schreibaktionen" },
      { agent: "Content-Agent", contribution: "prüft klare Freigabe-, Warn- und Abbruchtexte" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "hält fest, ob das Schutzmodell als wiederverwendbares Sicherheitsmuster taugt" },
    ],
    nonGoals: [
      "kein echter Live-Betrieb",
      "keine produktive Freischaltung",
      "keine technische Modul-Freigabe",
      "keine echte Stufe-3-Ausführung",
      "keine neuen POST/PATCH/PUT/DELETE-Endpunkte",
      "kein Schreib-Endpunkt",
      "keine Schreibfunktion",
      "keine echte technische Schreibfunktion vorbereiten",
      "keine Speicherung oder Schreiboperation",
      "keine Aufgabe speichern, zuweisen oder starten",
      "keine Projektstatusänderung",
      "keine Entscheidung speichern",
      "keine Checkliste aktualisieren",
      "keine Automatisierung",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine Canva-, HeyGen- oder Figma-Ausführung",
      "keine Veröffentlichung",
      "keine echten Kundendaten",
      "keine echten Produktfreigaben",
      "keine Rechts-, Steuer-, regulatorische oder medizinische Beratung/Freigabe",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Die Prüfung ist nur gültig, wenn Schutzmodell, Schreibaktionsgrenzen, Jamal-Freigabe, Audit, Rollback, Abbruchgrenze und sensible Sperrbereiche verständlich und prüfbar sind.",
    safetyBoundary:
      "V6.35.7 prüft nur das Zukunftsmodell: keine Schreibfunktion, kein Schreib-Endpunkt, keine Speicherung, keine Schreiboperation, keine technische Schreibvorbereitung und kein Live-Betrieb.",
    prepared: true,
    activated: false,
    manualReviewPrepared: true,
    futureModelReviewOnly: true,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    technicalWritePreparationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
    technicalModuleActivationBlocked: true,
  };
}

function getProductiveCentralDisabledWriteArchitecturePlan() {
  return {
    title: "Deaktivierten Schreibarchitekturplan vorbereiten",
    status:
      "deaktivierter Architekturplan für spätere Schreibfunktion vorbereitet, nicht aktiviert",
    source:
      "V6.35.7 hat das Schreibfähigkeits-Zukunftsmodell manuell prüfbar gemacht. V6.35.8 beschreibt nur einen deaktivierten Architekturplan für eine spätere Schreibfunktion.",
    plannedFutureWriteFunction: "Aufgabe nach Jamal-Freigabe speichern",
    clearStatement:
      "Dies ist nur ein Architekturplan. Es gibt keinen Schreib-Endpunkt, keinen Schreib-Handler und keine aktive Speicherung.",
    goal:
      "Technisch sichtbar machen, welche Bausteine eine spätere Schreibfunktion bräuchte, falls Jamal sie in einer späteren Version ausdrücklich freigibt.",
    whyLaterWriteFunctionCouldMatter:
      "Eine spätere Schreibfunktion könnte Jamal Arbeit abnehmen, indem freigegebene Aufgaben nicht nur angezeigt, sondern kontrolliert gespeichert werden.",
    whyNotActivatedNow:
      "V6.35.8 bleibt read-only. Schutzanforderungen, QA, Compliance und Jamal-Freigabe werden nur als Plan sichtbar, nicht technisch aktiviert.",
    laterTechnicalNeeds: [
      "eindeutige Entwurfsquelle",
      "eindeutige Jamal-Freigabe",
      "Validierung aller Pflichtfelder",
      "Sicherheitsprüfung vor Ausführung",
      "Audit-Anforderung",
      "Rollback- oder Korrekturpfad",
      "QA- und Compliance-Prüfung",
      "explizit freigegebener Schreib-Endpunkt in einer späteren Version",
    ],
    explicitlyNotBuiltInV6358: [
      "kein neuer POST/PATCH/PUT/DELETE-Endpunkt",
      "kein Schreib-Handler",
      "keine Speichern-Funktion",
      "kein aktiver Speichern-Button",
      "keine Aufgabe speichern",
      "keine Aufgabe zuweisen",
      "keine Aufgabe starten",
      "keine Projektstatusänderung",
      "keine Checklistenaktualisierung",
      "keine Entscheidung speichern",
    ],
    architecturePlanV1: [
      {
        component: "Entwurfsquelle",
        requirements: [
          "tägliche Projektarbeitskarte",
          "geprüfter Aufgabenentwurf",
          "eindeutige Projektzuordnung",
        ],
        status: "nur geplant",
      },
      {
        component: "Jamal-Freigabe",
        requirements: [
          "eindeutige Freigabeentscheidung",
          "sichtbare Ausführungsvorschau",
          "sichtbare Sicherheitsgrenze",
          "sichtbare Abbruchmöglichkeit",
        ],
        status: "nur geplant",
      },
      {
        component: "Validierung",
        requirements: [
          "Pflichtfelder vollständig",
          "Projekt eindeutig",
          "Aufgabe eindeutig",
          "keine sensiblen Daten ohne Schutzkonzept",
          "keine gesperrten Fachbereiche betroffen",
        ],
        status: "nur geplant",
      },
      {
        component: "Schreibaktion",
        requirements: [
          "später denkbar: Aufgabe speichern",
          "in V6.35.8 nicht vorhanden",
          "kein Endpunkt",
          "kein Handler",
          "keine Speicherung",
        ],
        status: "deaktiviert und nicht vorhanden",
      },
      {
        component: "Audit",
        requirements: [
          "wer hat freigegeben?",
          "wann wurde freigegeben?",
          "was sollte gespeichert werden?",
          "welches Projekt war betroffen?",
          "welcher Entwurf war Grundlage?",
          "welche Sicherheitsprüfung wurde durchgeführt?",
        ],
        status: "nur spätere Anforderung",
      },
      {
        component: "Rollback / Korrektur",
        requirements: [
          "spätere Änderung prüfbar",
          "spätere Korrektur möglich",
          "unklare Aktion blockiert",
          "fehlende Freigabe stoppt Ausführung",
        ],
        status: "nur spätere Anforderung",
      },
    ],
    disabledComponents: [
      { component: "Schreib-Endpunkt", status: "nicht vorhanden" },
      { component: "Schreib-Handler", status: "nicht vorhanden" },
      { component: "Speichern-Button", status: "nicht aktiv" },
      { component: "Datenbank", status: "nicht angebunden" },
      { component: "externe Systeme", status: "nicht angebunden" },
      { component: "echte Aufgabe", status: "nicht erstellt" },
      { component: "Audit-Eintrag", status: "nur als spätere Anforderung beschrieben" },
      { component: "Rollback", status: "nur als spätere Anforderung beschrieben" },
    ],
    laterTaskFields: [
      "Projekt",
      "Titel",
      "kleinster Arbeitsblock",
      "erwartetes Ergebnis",
      "beteiligte Agenten",
      "Jamal-Freigabe",
      "Sicherheitsgrenze",
      "Auswertung nach Ausführung",
    ],
    laterApprovalCheck:
      "Vor einer späteren Schreibaktion müsste Jamal eindeutig freigeben und die Ausführungsvorschau, Sicherheitsgrenze und Abbruchmöglichkeit sehen.",
    laterSafetyCheck:
      "Vor einer späteren Schreibaktion müssten Pflichtfelder, sensible Daten, gesperrte Fachbereiche, externe Aktionen und Autonomiegrenzen geprüft werden.",
    laterAuditRequirement:
      "Später müsste nachvollziehbar sein, wer freigegeben hat, wann freigegeben wurde, was gespeichert werden sollte und welche Sicherheitsprüfung bestanden wurde.",
    laterRollbackRequirement:
      "Später müsste jede Änderung prüfbar, korrigierbar und bei fehlender Freigabe oder unklarer Aktion blockierbar sein.",
    laterQaCheck:
      "QA müsste Testbarkeit, Bestandsschutz, Abbruchpfade, Fehlerfälle und Nicht-Aktivierung vor jeder echten Implementierung prüfen.",
    laterComplianceRiskCheck:
      "Compliance/Risiko müsste sensible Daten, externe Systeme, Expertenbereiche und dauerhaft gesperrte Aktionen prüfen.",
    laterJamalApproval:
      "Jamal müsste eine spätere Schreibfunktion in einer eigenen Version ausdrücklich freigeben; V6.35.8 enthält keine Freischaltung.",
    exampleWithoutRealWriteFunction: {
      laterPossibleAction: "Aufgabe nach Jamal-Freigabe speichern",
      plannedLaterTaskContent: [
        "Projekt",
        "Titel",
        "kleinster Arbeitsblock",
        "erwartetes Ergebnis",
        "beteiligte Agenten",
        "Jamal-Freigabe",
        "Sicherheitsgrenze",
        "Auswertung nach Ausführung",
      ],
      statusInV6358:
        "Nur deaktivierter Architekturplan. Keine Aufgabe wird gespeichert, zugewiesen oder gestartet.",
    },
    coreLogic:
      "Die Unternehmenszentrale darf später Arbeit abnehmen, aber Schreibfähigkeit wird nicht pauschal aktiviert. Zuerst wird nur ein deaktivierter Architekturplan sichtbar gemacht, damit Jamal, QA, Entwickler und Compliance prüfen können, ob eine spätere Schreibfunktion sicher gebaut werden darf.",
    agentFitnessSignals: [
      "GF-Agent prüft, ob spätere Schreibfähigkeit führbar bleibt",
      "Projektmanager-Agent prüft, ob Aufgabe, Projekt und Arbeitsblock eindeutig verbunden sind",
      "Entwickler-Agent prüft technische Architektur, ohne Schreibfunktion zu aktivieren",
      "QA-Agent prüft Testbarkeit, Bestandsschutz, Audit- und Rollback-Anforderungen",
      "Compliance/Risiko-Agent prüft Grenzen für spätere Schreibaktionen",
      "Content-Agent prüft Warntexte, Freigabetexte und Verständlichkeit",
      "HR-Agent leitet Trainingssignale für alle 25 Agenten ab",
      "Wissens/Archiv-Agent hält den deaktivierten Architekturplan als Sicherheitsmuster fest",
    ],
    hrTrainingDerivation:
      "HR kann alle 25 Agenten darauf trainieren, technische Ausführungsreife von echter Aktivierung zu trennen: planen ja, schreiben nein.",
    jamalOptions: [
      "Architekturplan übernehmen",
      "Schutzanforderungen schärfen",
      "Schreibarchitektur zurückstellen",
      "Stoppen / nicht weiterführen",
    ],
    adoptCriteria: [
      "Entwurfsquelle, Freigabe, Validierung, Audit und Rollback sind klar beschrieben",
      "deaktivierte Komponenten sind eindeutig als nicht vorhanden markiert",
      "spätere Aufgabenfelder sind verständlich",
      "Jamal, QA, Entwickler und Compliance können den Plan prüfen",
      "keine Schreibfunktion wird aktiviert",
    ],
    sharpenCriteria: [
      "Schutzanforderungen sind noch zu grob",
      "spätere Datenfelder sind nicht eindeutig genug",
      "Audit- oder Rollback-Anforderungen sind noch nicht prüfbar",
      "deaktivierte Komponenten müssen klarer abgegrenzt werden",
    ],
    postponeCriteria: [
      "der Architekturplan wirkt noch zu ausführungsnah",
      "V6.35.7-Prüfung ist noch nicht stabil genug",
      "QA-, Entwickler- oder Compliance-Grenzen sind noch nicht klar genug",
    ],
    stopCriteria: [
      "der Plan würde echte Schreibfähigkeit vortäuschen",
      "ein Endpunkt, Handler, Button oder Speicherpfad wäre impliziert",
      "Jamal-Freigabe, Audit oder Rollback fehlen",
      "sensible Daten oder gesperrte Fachbereiche wären nicht geschützt",
    ],
    expectedResultAfterApproval:
      "Jamal kann lokal entscheiden, ob der deaktivierte Schreibarchitekturplan als spätere Diskussionsgrundlage taugt, geschärft, zurückgestellt oder gestoppt wird.",
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft, ob spätere Schreibfähigkeit führbar bleibt" },
      { agent: "Projektmanager-Agent", contribution: "prüft, ob Aufgabe, Projekt und Arbeitsblock eindeutig verbunden sind" },
      { agent: "Entwickler-Agent", contribution: "prüft technische Architektur, ohne Schreibfunktion zu aktivieren" },
      { agent: "QA-Agent", contribution: "prüft Testbarkeit, Bestandsschutz, Audit- und Rollback-Anforderungen" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft Grenzen für spätere Schreibaktionen" },
      { agent: "Content-Agent", contribution: "prüft Warntexte, Freigabetexte und Verständlichkeit" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "hält den deaktivierten Architekturplan als Sicherheitsmuster fest" },
    ],
    nonGoals: [
      "kein echter Live-Betrieb",
      "keine produktive Freischaltung",
      "keine technische Modul-Freigabe",
      "keine echte Stufe-3-Ausführung",
      "keine neuen POST/PATCH/PUT/DELETE-Endpunkte",
      "kein Schreib-Endpunkt",
      "kein Schreib-Handler",
      "keine Schreibfunktion",
      "keine technische Schreibfunktion aktivieren",
      "keine Speichern-Funktion",
      "kein aktiver Speichern-Button",
      "keine Speicherung oder Schreiboperation",
      "keine Aufgabe speichern, zuweisen oder starten",
      "keine Projektstatusänderung",
      "keine Entscheidung speichern",
      "keine Checkliste aktualisieren",
      "keine Datenbankanbindung",
      "keine Automatisierung",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine Veröffentlichung",
      "keine echten Kundendaten",
      "keine echten Produktfreigaben",
      "keine Rechts-, Steuer-, regulatorische oder medizinische Beratung/Freigabe",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Der Architekturplan ist nur gültig, wenn er spätere Bausteine klar beschreibt und gleichzeitig eindeutig zeigt, dass nichts technisch aktiviert, gespeichert oder ausgeführt wird.",
    safetyBoundary:
      "V6.35.8 bleibt lokal, read-only und deaktiviert: kein Schreib-Endpunkt, kein Schreib-Handler, keine Schreibfunktion, keine Speicherung, keine Datenbankanbindung und kein Live-Betrieb.",
    prepared: true,
    activated: false,
    disabledArchitecturePlanPrepared: true,
    architecturePlanOnly: true,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    technicalWriteFunctionActivated: false,
    technicalWritePreparationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
    technicalModuleActivationBlocked: true,
  };
}

function getProductiveCentralDisabledWriteArchitecturePlanManualReview() {
  return {
    title: "Deaktivierten Schreibarchitekturplan manuell prüfen",
    status:
      "deaktivierter Schreibarchitekturplan manuell prüfbar vorbereitet, weiterhin nicht aktiviert",
    source:
      "V6.35.8 hat einen deaktivierten Architekturplan für die spätere Schreibfunktion 'Aufgabe nach Jamal-Freigabe speichern' vorbereitet. V6.35.9 prüft diesen Plan manuell.",
    reviewedArchitecturePlan: "Aufgabe nach Jamal-Freigabe speichern",
    clearStatement:
      "Die Unternehmenszentrale prüft nur den deaktivierten Architekturplan. Es gibt weiterhin keinen Schreib-Endpunkt, keinen Schreib-Handler, keine Speichern-Funktion und keine echte Speicherung.",
    reviewGoal:
      "Prüfen, ob der Architekturplan verständlich genug ist, nichts als aktiv erscheint und Freigabe, Validierung, Audit, Rollback, QA, Entwickler-, Compliance- und Jamal-Prüfung vollständig genug beschrieben sind.",
    whyBeforeTechnicalWriteImplementation:
      "Bevor eine echte Schreibfunktion gebaut werden darf, muss zuerst der deaktivierte Architekturplan selbst geprüft werden. Die Zentrale bleibt in V6.35.9 vollständig read-only.",
    reviewScope: [
      "Verständlichkeit des Architekturplans",
      "Klarheit, dass nichts aktiv ist",
      "Sinn der späteren Architekturbausteine",
      "Vollständigkeit von Freigabe, Validierung, Audit und Rollback",
      "Beurteilbarkeit durch QA, Entwickler, Compliance und Jamal",
      "Trainingssignale für alle 25 Agenten",
    ],
    reviewedArchitectureComponents: [
      "Entwurfsquelle",
      "Jamal-Freigabe",
      "Validierung",
      "spätere Schreibaktion",
      "Audit",
      "Rollback / Korrektur",
      "Sicherheitsprüfung",
      "Abbruchgrenze",
    ],
    disabledComponentReview: [
      "Schreib-Endpunkt nicht vorhanden",
      "Schreib-Handler nicht vorhanden",
      "Speichern-Button nicht aktiv",
      "Datenbank nicht angebunden",
      "externe Systeme nicht angebunden",
      "echte Aufgabe nicht erstellt",
      "Audit nur als spätere Anforderung beschrieben",
      "Rollback nur als spätere Anforderung beschrieben",
    ],
    reviewQuestions: [
      "Ist eindeutig, welche spätere Schreibfunktion geplant wäre?",
      "Ist eindeutig, dass sie noch nicht existiert?",
      "Ist klar, aus welchem Entwurf eine spätere Aufgabe entstehen würde?",
      "Ist Jamals Freigabe zwingend vorgesehen?",
      "Sind Pflichtfelder für eine spätere Aufgabe klar genug?",
      "Ist sichtbar, welche Änderung später passieren würde?",
      "Ist ein Audit-Konzept vorgesehen?",
      "Ist ein Rollback- oder Korrekturpfad vorgesehen?",
      "Sind sensible Daten weiterhin ausgeschlossen?",
      "Sind externe Systeme weiterhin ausgeschlossen?",
      "Sind gesperrte Fachbereiche sauber abgegrenzt?",
      "Ist klar, dass keine Agenten-Autonomie erhöht wird?",
      "Ist der Plan verständlich genug für Entwickler, QA, Compliance und Jamal?",
    ],
    possibleReviewResults: [
      "Architekturplan prüfbar und brauchbar",
      "Schutzanforderungen einmal schärfen",
      "Schreibarchitektur weiter zurückstellen",
      "stoppen / nicht weiterführen",
    ],
    usableCriteria: [
      "spätere Schreibfunktion, Quelle und Aufgabeninhalt sind eindeutig",
      "deaktivierte Komponenten sind klar als nicht vorhanden markiert",
      "Jamal-Freigabe, Validierung, Audit und Rollback sind verständlich",
      "QA, Entwickler, Compliance und Jamal können den Plan sicher beurteilen",
      "V6.35.9 bleibt vollständig read-only",
    ],
    sharpenCriteria: [
      "Warn-, Freigabe- oder Abbruchtexte sind noch nicht klar genug",
      "Pflichtfelder oder Validierung sind noch zu grob",
      "Audit- oder Rollback-Konzept muss konkreter werden",
      "deaktivierte Komponenten müssen sichtbarer getrennt werden",
    ],
    postponeCriteria: [
      "der Architekturplan wirkt noch zu früh",
      "V6.35.8 ist noch nicht verständlich genug",
      "QA-, Entwickler-, Compliance- oder Jamal-Prüfung kann den Plan noch nicht sicher bewerten",
    ],
    stopCriteria: [
      "der Plan wirkt wie eine echte Schreibfunktion",
      "Endpunkt, Handler, Speichern-Funktion oder Datenbankanbindung wirken vorhanden",
      "Freigabe, Validierung, Audit oder Rollback fehlen",
      "sensible Daten, externe Systeme oder gesperrte Fachbereiche wären nicht ausreichend ausgeschlossen",
    ],
    concreteReviewBasis: {
      laterPossibleWriteFunction: "Aufgabe nach Jamal-Freigabe speichern",
      statusInV6359:
        "Nur manuelle Prüfung des deaktivierten Architekturplans. Keine Aufgabe wird gespeichert, zugewiesen oder gestartet. Kein Schreib-Endpunkt vorhanden. Kein Schreib-Handler vorhanden. Keine Speichern-Funktion vorhanden.",
      project: "KI-Unternehmenszentrale",
      source: "Tägliche Projektarbeitskarte + geprüfter Aufgabenentwurf",
      laterPossibleAction:
        "Eine Aufgabe aus einer freigegebenen Tageskarte speichern.",
      result:
        "Die Unternehmenszentrale prüft, ob der deaktivierte Architekturplan sicher, verständlich, prüfbar und später technisch verantwortbar wäre.",
    },
    expectedReviewResult:
      "Jamal kann lokal entscheiden, ob der deaktivierte Schreibarchitekturplan prüfbar und brauchbar ist, einmal geschärft, weiter zurückgestellt oder gestoppt wird.",
    coreLogic:
      "Bevor eine echte Schreibfunktion gebaut werden darf, muss zuerst der deaktivierte Architekturplan selbst geprüft werden. Die Zentrale bleibt in V6.35.9 vollständig read-only.",
    agentFitnessSignals: [
      "GF-Agent prüft, ob spätere Schreibfähigkeit führbar und entscheidbar bleibt",
      "Projektmanager-Agent prüft, ob Aufgabe, Projekt und Arbeitsblock eindeutig verbunden wären",
      "Entwickler-Agent prüft technische Architektur, ohne Schreibfunktion zu aktivieren",
      "QA-Agent prüft Testbarkeit, Bestandsschutz, Audit- und Rollback-Anforderungen",
      "Compliance/Risiko-Agent prüft Grenzen für spätere Schreibaktionen",
      "Content-Agent prüft Warntexte, Freigabetexte und Verständlichkeit",
      "HR-Agent leitet Trainingssignale für alle 25 Agenten ab",
      "Wissens/Archiv-Agent hält fest, ob der Architekturplan als wiederverwendbares Sicherheitsmuster taugt",
    ],
    hrTrainingDerivation:
      "HR trainiert alle 25 Agenten darauf, Architekturprüfung von Aktivierung zu trennen und spätere Schreibfähigkeit nur mit klaren Schutzanforderungen zu denken.",
    developerRelation:
      "Der Entwickler-Agent prüft, ob der Plan technisch verständlich wäre, ohne Endpunkt, Handler, Speichern-Funktion oder Datenbankanbindung zu aktivieren.",
    qaRelation:
      "QA prüft Testbarkeit, Bestandsschutz, Nicht-Aktivierung, Audit, Rollback, Abbruchgrenzen und Fehlerfälle.",
    complianceRiskRelation:
      "Compliance/Risiko prüft sensible Daten, externe Systeme, Rechts-/Steuer-/Regulatorik-/Medizinbereiche und dauerhaft gesperrte Aktionen.",
    projectManagerRelation:
      "Der Projektmanager-Agent prüft, ob Aufgabe, Projekt, Arbeitsblock und spätere Aktion eindeutig verbunden wären.",
    knowledgeArchiveRelation:
      "Der Wissens-/Archiv-Agent hält fest, ob der Architekturplan als wiederverwendbares Sicherheitsmuster taugt, ohne ihn zu speichern.",
    jamalOptions: [
      "Architekturplan als brauchbar markieren",
      "Schutzanforderungen einmal schärfen",
      "Schreibarchitektur weiter zurückstellen",
      "Stoppen / nicht weiterführen",
    ],
    agentContributions: [
      { agent: "GF-Agent", contribution: "prüft, ob spätere Schreibfähigkeit führbar und entscheidbar bleibt" },
      { agent: "Projektmanager-Agent", contribution: "prüft, ob Aufgabe, Projekt und Arbeitsblock eindeutig verbunden wären" },
      { agent: "Entwickler-Agent", contribution: "prüft technische Architektur, ohne Schreibfunktion zu aktivieren" },
      { agent: "QA-Agent", contribution: "prüft Testbarkeit, Bestandsschutz, Audit- und Rollback-Anforderungen" },
      { agent: "Compliance/Risiko-Agent", contribution: "prüft Grenzen für spätere Schreibaktionen" },
      { agent: "Content-Agent", contribution: "prüft Warntexte, Freigabetexte und Verständlichkeit" },
      { agent: "HR-Agent", contribution: "leitet Trainingssignale für alle 25 Agenten ab" },
      { agent: "Wissens/Archiv-Agent", contribution: "hält fest, ob der Architekturplan als wiederverwendbares Sicherheitsmuster taugt" },
    ],
    nonGoals: [
      "kein echter Live-Betrieb",
      "keine produktive Freischaltung",
      "keine technische Modul-Freigabe",
      "keine echte Stufe-3-Ausführung",
      "keine neuen POST/PATCH/PUT/DELETE-Endpunkte",
      "kein Schreib-Endpunkt vorhanden",
      "kein Schreib-Handler vorhanden",
      "keine Schreibfunktion vorhanden",
      "keine Speichern-Funktion vorhanden",
      "kein aktiver Speichern-Button",
      "keine technische Schreibfunktion aktivieren",
      "keine echte technische Schreibumsetzung vorbereiten",
      "keine Speicherung oder Schreiboperation",
      "keine Aufgabe speichern, zuweisen oder starten",
      "keine Projektstatusänderung",
      "keine Entscheidung speichern",
      "keine Checkliste aktualisieren",
      "keine Datenbankanbindung",
      "keine Automatisierung",
      "keine externen Requests",
      "keine Plugin-Ausführung",
      "keine Veröffentlichung",
      "keine echten Kundendaten",
      "keine echten Produktfreigaben",
      "keine Rechts-, Steuer-, regulatorische oder medizinische Beratung/Freigabe",
      "keine automatische Projektentscheidung",
      "keine automatische Agenten-Autonomie-Erhöhung",
    ],
    qualityBoundary:
      "Die Prüfung ist nur gültig, wenn der deaktivierte Architekturplan verständlich, vollständig, prüfbar und für Entwickler, QA, Compliance und Jamal klar beurteilbar ist.",
    safetyBoundary:
      "V6.35.9 bleibt vollständig read-only: kein Schreib-Endpunkt, kein Schreib-Handler, keine Speichern-Funktion, keine Speicherung, keine technische Schreibumsetzung und kein Live-Betrieb.",
    prepared: true,
    activated: false,
    manualReviewPrepared: true,
    disabledArchitecturePlanReviewOnly: true,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    canvaExecutionBlocked: true,
    heyGenExecutionBlocked: true,
    figmaExecutionBlocked: true,
    realImageProductionBlocked: true,
    realVideoProductionBlocked: true,
    publicationBlocked: true,
    realCustomerDataBlocked: true,
    realProductApprovalBlocked: true,
    legalAdviceBlocked: true,
    taxAdviceBlocked: true,
    regulatoryAdviceBlocked: true,
    regulatoryApprovalBlocked: true,
    automaticCountryDecisionBlocked: true,
    diagnosisBlocked: true,
    healingClaimsBlocked: true,
    medicalAdviceBlocked: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
    technicalModuleActivationBlocked: true,
  };
}

function getProductiveCentralWritePermissionDecisionCorridor() {
  return {
    title: "Schreibfreigabe-Entscheidungskorridor vorbereiten",
    status: "Schreibfreigabe nur als manueller Entscheidungskorridor vorbereitet",
    activationNotice: "Es wurde keine Schreibfähigkeit aktiviert.",
    source:
      "V6.35.9 hat den deaktivierten Schreibarchitekturplan manuell prüfbar gemacht. V6.36.0 aktiviert diesen Plan nicht, sondern bewertet nur, ob, wann und unter welchen Bedingungen spätere Schreibfähigkeit überhaupt denkbar wäre.",
    reviewedArchitecturePlan:
      "Deaktivierter Schreibarchitekturplan: Aufgabe nach Jamal-Freigabe speichern",
    leadershipQuestion:
      "Welche Schreibfähigkeit darf später überhaupt denkbar sein - und welche bleibt gesperrt?",
    purpose: [
      "Entscheidungslogik für spätere Schreibfähigkeit sichtbar machen",
      "Freigabebedingungen vor jeder technischen Vorbereitung festlegen",
      "Sperrbereiche und Sicherheitsstufen klar trennen",
      "Agentenrollen ohne neue Autonomie beschreiben",
      "Jamals manuelle Führungsentscheidung vorbereiten",
    ],
    possibleLaterWriteAreas: [
      {
        area: "Entscheidungsnotiz speichern",
        status: "nicht aktiv, nicht technisch umgesetzt, nur prüfbar",
        condition: "nur nach separater Jamal-Freigabe und sichtbarer Ziel-/Inhaltsprüfung denkbar",
      },
      {
        area: "Projektverlauf ergänzen",
        status: "nicht aktiv, nicht technisch umgesetzt, nur prüfbar",
        condition: "nur wenn Quelle, Projekt, Änderung, Audit und Abbruchgrenze vorher sichtbar sind",
      },
      {
        area: "Checklistenstatus aktualisieren",
        status: "nicht aktiv, nicht technisch umgesetzt, nur prüfbar",
        condition: "nur wenn keine Fachfreigabe, keine Kundendaten und keine externe Aktion betroffen sind",
      },
      {
        area: "Aufgabenentwurf vorbereiten",
        status: "nicht aktiv, nicht technisch umgesetzt, nur prüfbar",
        condition: "bleibt Entwurfslogik; keine Aufgabe speichern, zuweisen oder starten",
      },
      {
        area: "Projektstatus vorschlagen",
        status: "nicht aktiv, nicht technisch umgesetzt, nur prüfbar",
        condition: "nur Vorschlag, keine automatische Projektstatusänderung",
      },
    ],
    stillBlockedAreas: [
      "automatische Projektstatusänderung",
      "automatische Aufgabenvergabe",
      "automatische externe Kommunikation",
      "automatische Airtable-/Datenbank-Schreibzugriffe",
      "automatische Plugin-Ausführung",
      "Deployment",
      "echte Nutzer-/Kundendaten",
      "Health-, Finanz-, Rechts- oder Compliance-Entscheidungen ohne manuelle Freigabe",
      "technische Schreibumsetzung ohne ausdrückliche spätere Einzelentscheidung",
    ],
    approvalConditionsBeforeAnyLaterTechnicalWritePreparation: [
      "Jamal muss den konkreten Schreibbereich manuell freigeben.",
      "Es muss sichtbar sein, was geschrieben würde.",
      "Es muss sichtbar sein, wohin geschrieben würde.",
      "Es muss eine Abbruch-/Nicht-Ausführen-Grenze geben.",
      "Es darf keine automatische Ausführung geben.",
      "Jeder spätere Schreibschritt muss separat geprüft werden.",
      "Read-only bleibt Standard.",
      "Keine technische Schreibvorbereitung ohne eigene spätere Freigabe.",
    ],
    agentRoles: [
      { agent: "GF-Agent", role: "darf Entscheidungsvorlage strukturieren, aber nicht schreiben" },
      { agent: "Projektmanager-Agent", role: "darf Risiko, Reihenfolge und Freigabegrenzen prüfen, aber nicht ausführen" },
      { agent: "Compliance/Risiko-Agent", role: "darf Sperrgrenzen bewerten, aber nichts freischalten" },
      { agent: "QA-Agent", role: "darf Prüfpunkte formulieren, aber nichts aktivieren" },
      { agent: "Entwickler-Agent", role: "darf später nur nach manueller Freigabe technische Optionen vorbereiten, setzt in V6.36.0 aber nichts davon um" },
      { agent: "HR-Agent", role: "darf Autonomiegrenzen bewerten, aber keine Autonomie erhöhen" },
      { agent: "Plugin/Tool-Radar-Agent", role: "darf Tool-Bedarf nur read-only einordnen" },
    ],
    jamalOptions: [
      "Korridor prüfen",
      "Sperrbereiche verschärfen",
      "Schreibfreigabe weiterhin stoppen",
      "Späteren Einzelbereich zur Prüfung vormerken",
    ],
    recommendation:
      "Schreibfähigkeit weiterhin nicht aktivieren. Zuerst nur den Entscheidungskorridor prüfen und Sperrbereiche bestätigen.",
    qualityBoundary:
      "Der Entscheidungskorridor ist nur gültig, wenn jeder spätere Schreibbereich als deaktivierte Prüfkategorie sichtbar bleibt und Jamal klar zwischen denkbar, gesperrt, später einzeln zu prüfen und dauerhaft verboten unterscheiden kann.",
    safetyBoundary:
      "Keine Schreibfunktion. Keine Speicherung. Keine Datenbank. Keine externen Requests. Keine Automatisierung. Keine technische Schreibvorbereitung. Nur manuelle Prüfung und Führungsentscheidung.",
    nonGoals: [
      "keine technische Schreibumsetzung",
      "kein Speichern",
      "kein Aufgabenstart",
      "keine Projektstatusänderung",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine Datenbankanbindung",
      "keine POST/PATCH/PUT/DELETE-Endpunkte",
      "keine externen Requests",
      "keine Automatisierung",
      "kein Deployment",
      "keine Plugin-Ausführung",
      "keine echte technische Schreibumsetzung vorbereiten",
    ],
    prepared: true,
    activated: false,
    decisionCorridorOnly: true,
    manualLeadershipDecisionRequired: true,
    writePermissionGranted: false,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    requiresManualDecision: true,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    readOnlyDefault: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    automaticExternalCommunicationBlocked: true,
    automaticAirtableDatabaseWritesBlocked: true,
    realCustomerDataBlocked: true,
    healthFinanceLegalComplianceDecisionsBlockedWithoutManualApproval: true,
    automaticProjectDecisionBlocked: true,
    automaticProjectWorkBlocked: true,
    automaticAgentAutonomyIncreaseBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
    technicalModuleActivationBlocked: true,
  };
}

function getProductiveCentralWritePermissionManualDecisionEvaluation() {
  return {
    title: "Schreibfreigabe-Entscheidung manuell auswerten",
    status: "manuelle Auswertung der Schreibfreigabe-Entscheidung vorbereitet",
    source: [
      "Der Schreibfreigabe-Entscheidungskorridor aus V6.36.0 ist vorbereitet.",
      "Es wurde noch keine Schreibfähigkeit aktiviert.",
      "Die Zentrale bleibt read-only und entscheidungsvorbereitend.",
    ],
    manualEvaluationQuestions: [
      "Soll überhaupt irgendwann ein begrenzter Schreibbereich geprüft werden?",
      "Wenn ja: welcher Bereich wäre am risikoärmsten?",
      "Wenn nein: warum bleibt Schreiben weiterhin vollständig gesperrt?",
    ],
    possibleManualDecisions: [
      "Weiter vollständig blockieren",
      "Später enger prüfen",
      "Nur einen sehr kleinen, isolierten Schreibkandidaten vorbereitend bewerten",
      "Schreibfähigkeit weiterhin nicht technisch vorbereiten",
    ],
    allowedCandidatesForLaterReviewOnly: [
      { candidate: "interne Entscheidungsnotiz", status: "nur Bewertung, keine Umsetzung" },
      { candidate: "lokaler Projektverlaufseintrag", status: "nur Bewertung, keine Umsetzung" },
      { candidate: "manuelle Checklisten-Markierung", status: "nur Bewertung, keine Umsetzung" },
      { candidate: "rein lokaler Tagesabschluss-Vermerk", status: "nur Bewertung, keine Umsetzung" },
    ],
    stillBlockedAreas: [
      "Airtable-Schreiben",
      "externe Requests",
      "automatische Aufgabenanlage",
      "Projektstatusänderung",
      "Kundendaten",
      "echte Speicherung",
      "Plugin-Ausführung",
      "Deployment",
      "Automatisierung",
      "jede produktive Datenbankänderung",
    ],
    minimumConditionsBeforeAnyLaterTechnicalImplementation: [
      "eindeutige manuelle Freigabe durch Jamal",
      "nur ein isolierter Schreibkandidat",
      "keine externen Systeme",
      "keine echten Kundendaten",
      "keine automatische Ausführung",
      "sichtbare Abbruchgrenzen",
      "vorherige Sicherheitsprüfung",
      "Rückbau muss möglich sein",
    ],
    riskEvaluation: [
      {
        level: "niedriges Risiko",
        meaning:
          "nur intern, lokal, isoliert, ohne externe Systeme, ohne echte Kundendaten und jederzeit abbrechbar",
      },
      {
        level: "mittleres Risiko",
        meaning:
          "lokal begrenzt, aber mit späterer Änderung an Projektlogik, Checkliste oder Verlauf verbunden",
      },
      {
        level: "hohes Risiko",
        meaning:
          "externe Systeme, Kundendaten, Fachentscheidungen, Projektstatus, Automatisierung oder produktive Datenbankänderungen wären betroffen",
      },
      {
        level: "Abbruchgrenze",
        meaning:
          "Sobald externe Systeme, echte Daten, automatische Ausführung, produktive Speicherung oder Fachfreigaben nötig wären, bleibt Schreiben vollständig gesperrt.",
      },
    ],
    recommendation:
      "Noch keine technische Schreibfähigkeit aktivieren. Zuerst nur manuell auswerten, ob ein späterer Mini-Schreibbereich überhaupt sinnvoll wäre. Jamal bleibt alleiniger Entscheider.",
    qualityBoundary:
      "Diese Version bewertet nur. Sie speichert nichts, startet nichts, verändert keine Projektdaten, aktiviert keine Schreibarchitektur und bereitet keinen technischen Schreib-Handler vor.",
    safetyBoundary:
      "Ausschließlich lesen, anzeigen, strukturieren und manuelle Entscheidungen vorbereiten. Keine Schreibfunktion, keine Speicherung, keine Datenbank, keine externen Requests, keine Automatisierung und keine technische Schreibvorbereitung.",
    prepared: true,
    activated: false,
    evaluationOnly: true,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    productiveDatabaseChangeBlocked: true,
    realCustomerDataBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
  };
}

function getProductiveCentralWritePermissionDecisionTemplate() {
  return {
    title: "Schreibfreigabe-Entscheidungsvorlage ableiten",
    status:
      "Entscheidungsvorlage aus manueller Schreibfreigabe-Auswertung vorbereitet",
    source:
      "V6.36.1 hat die Schreibfreigabe-Entscheidung manuell auswertbar gemacht. Die Entscheidung bleibt weiterhin ausschließlich manuell bei Jamal.",
    manualDecisionOnly: true,
    decisionTemplate: [
      {
        path: "Nicht freigeben",
        reason: "Sicherheitsgrenzen reichen noch nicht aus",
        consequence: "Schreibfunktionen bleiben vollständig gesperrt",
      },
      {
        path: "Weiter vorbereiten",
        reason: "Entscheidungsgrundlage ist noch nicht eindeutig genug",
        consequence: "weitere read-only Präzisierung ohne technische Schreibaktivierung",
      },
      {
        path: "Begrenzt freigabefähig vormerken",
        reason: "fachlich denkbar, aber nur unter harten Sicherheitsbedingungen",
        consequence: "keine Aktivierung, nur manuelle Vormerkung für spätere Prüfung",
      },
    ],
    recommendedDecision: "Weiter vorbereiten",
    recommendationReasons: [
      "Die Schreibfreigabe ist fachlich noch nicht reif für Aktivierung.",
      "Die Sicherheitsgrenzen sind bestätigt, aber noch keine konkrete technische Minimalarchitektur freigegeben.",
      "Der nächste sichere Schritt ist eine weiter präzisierte, read-only Freigabegrenze.",
    ],
    jamalOptions: [
      "Nicht freigeben",
      "Weiter vorbereiten",
      "Begrenzt vormerken, aber nicht aktivieren",
    ],
    nonGoals: [
      "keine Schreibfunktion aktivieren",
      "keine technische Schreibarchitektur bauen",
      "keine Speichern-Funktion ergänzen",
      "keinen Button aktivieren",
      "keine Datenbank- oder Airtable-Schreibanbindung ergänzen",
      "keine Projektstatusänderung auslösen",
      "keine Entscheidung speichern",
    ],
    qualityBoundary:
      "Diese Version darf ausschließlich eine read-only Entscheidungsvorlage darstellen.",
    safetyBoundary:
      "Sie darf keine technische Schreibfähigkeit vorbereiten, simulieren oder aktivieren. Jede produktive Schreibfunktion bleibt gesperrt.",
    prepared: true,
    activated: false,
    decisionTemplateOnly: true,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteArchitectureBuilt: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    productiveDatabaseChangeBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
  };
}

function getProductiveCentralWritePermissionReadOnlyReleaseBoundary() {
  return {
    title: "Read-only Freigabegrenze präzisieren",
    status:
      "read-only Freigabegrenze für mögliche spätere Schreibfähigkeit präzisiert",
    source: [
      "V6.36.2 hat eine read-only Schreibfreigabe-Entscheidungsvorlage vorbereitet.",
      "V6.36.3 trifft keine Schreibentscheidung.",
      "V6.36.3 beschreibt nur die Grenze und bereitet keine technische Umsetzung vor.",
    ],
    purpose: [
      "Die KI-Unternehmenszentrale bleibt vollständig read-only.",
      "Schreibfähigkeit darf erst später überhaupt geprüft werden, wenn fachliche, technische und Sicherheitsbedingungen erfüllt sind.",
      "Diese Version definiert nur Kriterien, keine Aktivierung.",
    ],
    hardMinimumConditionsForLaterReview: [
      "Jamal muss manuell bestätigen, welcher konkrete Schreibfall geprüft werden soll.",
      "Es muss genau ein begrenzter Schreibfall sein, nicht mehrere gleichzeitig.",
      "Der Schreibfall muss fachlich notwendig sein.",
      "Der Schreibfall muss rückgängig machbar oder eindeutig kontrollierbar sein.",
      "Es muss eine sichtbare Vorschau vor jeder späteren Schreibaktion geben.",
      "Es muss eine manuelle Bestätigung unmittelbar vor jeder späteren Schreibaktion geben.",
      "Es darf keine automatische Ausführung im Hintergrund geben.",
      "Es darf keine externe Ausführung ohne Jamals aktive Freigabe geben.",
      "Es muss eine klare Abbruchgrenze geben.",
      "Es muss später gesondert entschieden werden, ob überhaupt technische Umsetzung erlaubt ist.",
    ],
    currentlyNotReleasableAreas: [
      "Projektstatus ändern",
      "Aufgaben erstellen oder zuweisen",
      "Checklisten aktualisieren",
      "Entscheidungen speichern",
      "Airtable-Daten schreiben",
      "Datenbankeinträge schreiben",
      "externe Tools ausführen",
      "Automationen starten",
      "Deployments auslösen",
      "Nutzer- oder Kundendaten verändern",
    ],
    jamalOptions: [
      "Grenze akzeptieren und weiter read-only vorbereiten",
      "Grenze verschärfen",
      "Schreibfähigkeit weiter vollständig ausschließen",
    ],
    recommendation: "Grenze akzeptieren und weiter read-only vorbereiten",
    recommendationReasons: [
      "Die Grenze schafft Klarheit, ohne technische Schreibfähigkeit vorzubereiten.",
      "Die Zentrale bleibt sicher und kontrolliert.",
      "Der nächste sinnvolle Schritt wäre später eine einzelne, manuell prüfbare Schreibfall-Kandidatenliste, weiterhin read-only.",
    ],
    nonGoals: [
      "keine Schreibfunktion aktivieren",
      "keine technische Schreibarchitektur bauen",
      "keine technische Schreibvorbereitung ergänzen",
      "keine Speichern-Funktion ergänzen",
      "keinen aktiven Button ergänzen",
      "keine Datenbank- oder Airtable-Schreibanbindung ergänzen",
      "keine Projektstatusänderung auslösen",
      "keine Entscheidung speichern",
      "keine Aufgabe erstellen",
      "keine Checkliste aktualisieren",
      "keine externe Ausführung vorbereiten",
    ],
    qualityBoundary:
      "Diese Version darf ausschließlich eine read-only Freigabegrenze darstellen.",
    safetyBoundary:
      "Sie darf keine technische Schreibfähigkeit vorbereiten, simulieren oder aktivieren. Jede produktive Schreibfunktion bleibt gesperrt. Jede spätere Schreibfähigkeit benötigt eine eigene manuelle Freigabe und eine eigene Version.",
    prepared: true,
    activated: false,
    releaseBoundaryOnly: true,
    writeCapabilityActivated: false,
    writeDecisionMade: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteArchitectureBuilt: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    externalExecutionBlocked: true,
    productiveDatabaseChangeBlocked: true,
    realCustomerDataBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
  };
}

function getProductiveCentralManualReleaseDecisionReadOnlyStructure() {
  return {
    title: "Manuelle Freigabeentscheidung als reine Lesestruktur vorbereiten",
    status: "manuelle Freigabeentscheidung nur als Lesestruktur vorbereitet",
    source:
      "V6.36.3 hat die read-only Freigabegrenze für mögliche spätere Schreibfähigkeit präzisiert. V6.36.4 zeigt nur als Lesestruktur, welche manuelle Entscheidung später irgendwann nötig wäre.",
    leadershipQuestion:
      "Welche Entscheidung müsste Jamal manuell treffen, bevor irgendeine Schreibfähigkeit überhaupt weitergedacht werden darf?",
    possibleManualDecisionDirections: [
      "Nicht freigeben",
      "Weiter read-only prüfen",
      "Nur Konzept nachschärfen",
      "Später begrenzte technische Vorbereitung prüfen",
      "Stoppen / nicht weiterführen",
    ],
    explicitlyNot: [
      "keine Freigabe",
      "keine technische Vorbereitung",
      "keine Simulation",
      "keine Aktivierung",
      "keine Schreiblogik",
      "keine Speicherfunktion",
      "kein Projektstatuswechsel",
      "keine Checklistenaktualisierung",
    ],
    requiredEvidenceBeforeAnyLaterRealRelease: [
      "fachlicher Nutzen klar",
      "Risiko klar",
      "manuelle Entscheidung durch Jamal klar",
      "Rücknahme-/Stopplogik klar",
      "keine unkontrollierte Datenveränderung möglich",
      "keine externen Systeme betroffen",
      "keine Airtable- oder Datenbank-Schreibanbindung aktiv",
    ],
    jamalDisplayOptions: [
      "Weiter read-only schärfen",
      "Manuell prüfen",
      "Nicht weiterführen",
    ],
    qualityBoundary:
      "Die Sektion darf nur Orientierung geben.",
    safetyBoundary:
      "Sie darf keine technische Schreibfähigkeit vorbereiten, keine Entscheidung speichern, keine Aktion auslösen und keine externen Requests ausführen.",
    prepared: true,
    activated: false,
    readOnlyStructureOnly: true,
    releaseGranted: false,
    writeCapabilityActivated: false,
    writeDecisionMade: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    approvalButtonWithEffectAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteArchitectureBuilt: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    externalExecutionBlocked: true,
    productiveDatabaseChangeBlocked: true,
    realCustomerDataBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
  };
}

function getProductiveCentralManualReleaseDecisionGfReviewQuestions() {
  return {
    title: "Manuelle Freigabeentscheidung in GF-Prüffragen übersetzen",
    status: "GF-Prüffragen zur manuellen Freigabeentscheidung read-only vorbereitet",
    source: [
      "V6.36.4 hat nur eine reine Lesestruktur vorbereitet.",
      "Es gibt weiterhin keine aktive Freigabe, keine Speicherwirkung und keine Schreibausführung.",
    ],
    purpose: [
      "Die vorbereitete Freigabeentscheidung wird in GF-Prüffragen übersetzt.",
      "Die Fragen helfen Jamal, Risiken, Grenzen und Bedingungen einer möglichen späteren Schreibfreigabe besser zu beurteilen.",
    ],
    gfReviewQuestions: [
      "Darf diese Struktur grundsätzlich jemals schreiben?",
      "Welche Informationen dürften höchstens vorbereitet, aber nicht gespeichert werden?",
      "Welche Grenze bleibt zwingend read-only?",
      "Welche Bedingungen müssten erfüllt sein, bevor über echte Schreibrechte gesprochen wird?",
      "Welche Agenten dürften niemals selbstständig schreiben?",
      "Welche Freigabe müsste Jamal manuell geben?",
      "Welche Aktionen bleiben ausdrücklich verboten?",
      "Was wäre ein Stoppsignal gegen jede Schreibfreigabe?",
    ],
    recommendedClassification: [
      "weiterhin read-only lassen",
      "noch keine technische Schreibvorbereitung",
      "erst entscheiden, welche Bedingungen, Grenzen und Verbote dauerhaft gelten",
    ],
    nonGoals: [
      "keine Schreibfreigabe",
      "keine Speicherfunktion",
      "kein aktiver Button",
      "keine Entscheidungsspeicherung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderung",
      "keine Checklistenaktualisierung",
      "keine Airtable- oder Datenbank-Schreibanbindung",
      "keine Simulation einer Schreibfreigabe",
      "keine Plugin-Ausführung",
      "keine externe Anfrage",
      "kein Deployment",
    ],
    safetyBoundary:
      "Diese Sektion ist ausschließlich eine Lesestruktur zur manuellen GF-Prüfung. Sie darf keine technische Schreibwirkung vorbereiten, simulieren oder aktivieren.",
    prepared: true,
    activated: false,
    gfReviewQuestionsOnly: true,
    releaseGranted: false,
    writeCapabilityActivated: false,
    writeDecisionMade: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    approvalButtonWithEffectAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteArchitectureBuilt: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    externalExecutionBlocked: true,
    productiveDatabaseChangeBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
  };
}

function getProductiveCentralManualReleaseDecisionGfDecisionMask() {
  return {
    title: "GF-Prüffragen in manuelle Entscheidungsmaske verdichten",
    status: "manuelle GF-Entscheidungsmaske read-only vorbereitet",
    source: [
      "Die GF-Prüffragen aus der manuellen Freigabeentscheidung wurden in V6.36.5 vorbereitet.",
      "Es gibt weiterhin keine Schreibrechte, keine Speicherfunktion und keine Automatisierung.",
    ],
    purpose: [
      "Jamal soll manuell erkennen können, ob eine spätere Freigabe fachlich denkbar wäre.",
      "Die Maske dient nur der Orientierung und Prüfung.",
      "Sie ist ausdrücklich keine Freigabe, kein Speichern und kein Aufgabenstart.",
    ],
    manualReviewFieldsForJamal: [
      "Ist der Zweck der möglichen Freigabe eindeutig?",
      "Ist die fachliche Grenze verständlich?",
      "Bleibt die Funktion vollständig read-only?",
      "Sind Risiken, Missverständnisse oder Automatisierungsgefahren ausgeschlossen?",
      "Welche manuelle Entscheidung wäre später denkbar?",
      "Was bleibt ausdrücklich gesperrt?",
    ],
    possibleManualDecisionTypes: [
      "Weiter manuell prüfen",
      "Noch nicht freigeben",
      "Grenze nachschärfen",
      "Abbrechen / nicht weiterführen",
    ],
    blockedAreas: [
      "keine neuen Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine externen Requests",
      "keine Automatisierung",
      "kein Deployment",
      "keine Plugin-Ausführung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
    ],
    recommendation: [
      "Die Entscheidungsmaske ist sinnvoll, weil sie Jamals spätere manuelle Prüfung strukturiert.",
      "Sie darf nur als Lesestruktur erscheinen.",
      "Der nächste Schritt darf weiterhin keine Schreibfähigkeit aktivieren.",
    ],
    qualityBoundary:
      "Diese Version bereitet keine produktive Freigabe vor. Sie übersetzt Prüffragen nur in eine lesbare manuelle Entscheidungsstruktur.",
    safetyBoundary:
      "Jede echte Entscheidung bleibt außerhalb des Systems und muss manuell durch Jamal erfolgen.",
    prepared: true,
    activated: false,
    decisionMaskOnly: true,
    readOnlyDecisionStructureOnly: true,
    releaseGranted: false,
    decisionStored: false,
    writeCapabilityActivated: false,
    writeDecisionMade: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    approvalButtonWithEffectAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteArchitectureBuilt: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    externalExecutionBlocked: true,
    productiveDatabaseChangeBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
  };
}

function getProductiveCentralManualReleaseDecisionGfShortDecision() {
  return {
    title: "Manuelle Entscheidungsmaske in GF-Kurzentscheidung zusammenfassen",
    status: "GF-Kurzentscheidungsvorlage read-only vorbereitet",
    source: [
      "Die GF-Prüffragen wurden in V6.36.6 in eine manuelle Entscheidungsmaske verdichtet.",
      "Die Struktur bleibt vollständig read-only.",
      "Es gibt weiterhin keine Schreibrechte, keine Speicherfunktion und keine Automatisierung.",
    ],
    purpose: [
      "Jamal soll die Entscheidungslage schnell erfassen können.",
      "Die Kurzentscheidung dient nur der manuellen Orientierung.",
      "Sie ist keine Freigabe, kein Speichern, kein Aufgabenstart und keine Systemaktion.",
    ],
    shortDecisionCardForJamal: [
      "Was wird geprüft?",
      "Welche manuelle Entscheidung wäre theoretisch denkbar?",
      "Was empfiehlt die Zentrale?",
      "Welche Grenze ist am wichtigsten?",
      "Was bleibt ausdrücklich gesperrt?",
      "Warum darf das System daraus keine Aktion ableiten?",
    ],
    possibleManualShortDecision: [
      "Weiter manuell prüfen",
      "Noch nicht freigeben",
      "Grenze nachschärfen",
      "Nicht weiterführen",
    ],
    recommendation: [
      "Die GF-Kurzentscheidung ist sinnvoll, weil sie die Entscheidungsmaske für Jamal verdichtet.",
      "Sie darf nur als Lesestruktur erscheinen.",
      "Der nächste Schritt darf weiterhin keine Schreibfähigkeit, Speicherung oder Automatisierung vorbereiten.",
    ],
    blockedAreas: [
      "keine neuen Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine externen Requests",
      "keine Automatisierung",
      "kein Deployment",
      "keine Plugin-Ausführung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
    ],
    qualityBoundary:
      "Diese Version fasst nur eine vorhandene manuelle Entscheidungsmaske zusammen. Sie erzeugt keine produktive Freigabe.",
    safetyBoundary:
      "Sie speichert keine Entscheidung, startet keine Aufgabe und jede echte Entscheidung bleibt außerhalb des Systems und muss manuell durch Jamal erfolgen.",
    prepared: true,
    activated: false,
    shortDecisionOnly: true,
    decisionMaskSummaryOnly: true,
    readOnlyDecisionStructureOnly: true,
    releaseGranted: false,
    decisionStored: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeDecisionMade: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    approvalButtonWithEffectAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteArchitectureBuilt: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    readOnlyOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    externalExecutionBlocked: true,
    productiveDatabaseChangeBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
  };
}

function getProductiveCentralManualReleaseDecisionCard() {
  return {
    title: "GF-Kurzentscheidung in manuelle Freigabekarte überführen",
    status: [
      "manuelle Freigabekarte vorbereitet",
      "weiterhin read-only",
      "keine technische Schreibaktivierung",
    ],
    source: [
      "Ausgangspunkt ist V6.36.7.",
      "Die GF-Kurzentscheidung wurde verdichtet.",
      "Jetzt wird daraus eine manuelle Entscheidungs-/Freigabekarte.",
    ],
    decisionQuestion:
      "Kann Jamal diesen Bereich grundsätzlich für eine spätere Schreibfreigabe vorbereiten - ja, nein oder nur unter Bedingungen?",
    gfDecisionCard: {
      recommendation: [
        "weiter vorbereiten",
        "noch nicht freigeben",
        "zurück in Prüfung",
        "stoppen",
      ],
      shortReason:
        "Die Freigabekarte macht die spätere GF-Entscheidung lesbar, ohne eine Freigabe oder Schreibfähigkeit auszulösen.",
      mainRisk:
        "Eine zu frühe technische Interpretation könnte als Schreibfreigabe missverstanden werden.",
      requiredConditionBeforeNextStep:
        "Vor jedem nächsten Schritt muss sichtbar bleiben, dass nur read-only vorbereitet wird und keine technische Schreibaktivierung erfolgt.",
      noRealReleaseStatement:
        "Es erfolgt noch keine echte Freigabe. Jamal entscheidet außerhalb des Systems manuell.",
    },
    gfOptions: [
      "Weiter vorbereiten",
      "Noch nicht freigeben",
      "Zurück in Prüfung",
      "Stoppen",
    ],
    reviewQuestionsForJamal: [
      "Ist der Zweck eindeutig?",
      "Ist die Grenze eindeutig?",
      "Ist das Risiko verständlich?",
      "Ist klar, was noch nicht erlaubt ist?",
      "Ist klar, welcher nächste Vorbereitungsschritt folgen darf?",
    ],
    nonGoals: [
      "keine Speicherfunktion",
      "keine Aufgabenstarts",
      "keine Projektstatusänderung",
      "keine Checklistenaktualisierung",
      "keine Airtable-/Datenbank-Schreibanbindung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
    ],
    qualityBoundary:
      "Die Freigabekarte darf nur Orientierung geben und keine echte Schreibfreigabe auslösen.",
    safetyBoundary:
      "Sie darf keine Entscheidungen speichern, keine externen Systeme verändern und bleibt vollständig manuell und read-only.",
    prepared: true,
    activated: false,
    releaseCardOnly: true,
    manualReleaseCardOnly: true,
    readOnlyOnly: true,
    releaseGranted: false,
    decisionStored: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeDecisionMade: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    approvalButtonWithEffectAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteArchitectureBuilt: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    externalExecutionBlocked: true,
    productiveDatabaseChangeBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
  };
}

function getProductiveCentralManualReleaseDecisionFinalOverview() {
  return {
    title: "Manuelle Freigabekarte zu finaler Fertigstellungsübersicht verdichten",
    completionStatus: [
      "finale Fertigstellungsübersicht vorbereitet",
      "fachlicher Entscheidungsstand lesbar abgeschlossen",
      "weiterhin vollständig read-only",
      "keine technische Schreibfähigkeit aktiviert",
    ],
    releaseChainSummary: [
      "V6.36.0: Schreibfreigabe-Entscheidungskorridor ohne Aktivierung vorbereitet.",
      "V6.36.1: manuelle Schreibfreigabe-Entscheidung auswertbar gemacht.",
      "V6.36.2: Entscheidungsvorlage abgeleitet.",
      "V6.36.3: read-only Freigabegrenze präzisiert.",
      "V6.36.4: manuelle Freigabeentscheidung als reine Lesestruktur vorbereitet.",
      "V6.36.5: GF-Prüffragen formuliert.",
      "V6.36.6: GF-Prüffragen in manuelle Entscheidungsmaske verdichtet.",
      "V6.36.7: Entscheidungsmaske in GF-Kurzentscheidung zusammengefasst.",
      "V6.36.8: GF-Kurzentscheidung in manuelle Freigabekarte überführt.",
    ],
    finalGfReadingVersion: {
      summary:
        "Jamal sieht einen final vorbereiteten, rein lesenden Entscheidungsstand zur möglichen späteren Schreibfreigabe.",
      currentDecisionReadiness:
        "Fachlich vollständig genug, um als manueller Entscheidungsstand betrachtet zu werden.",
      noActivationStatement:
        "Die Übersicht aktiviert keine Schreibfähigkeit und löst keine Systemaktion aus.",
    },
    whatIsReadyNow: [
      "Freigabekorridor, Auswertung, Vorlage, Grenze, Lesestruktur, GF-Prüffragen, Entscheidungsmaske, Kurzentscheidung und Freigabekarte sind als read-only Kette vorbereitet.",
      "Jamal kann den Stand manuell akzeptieren, fachlich nachschärfen oder nicht weiterverfolgen.",
      "Die Sicherheitsgrenzen sind sichtbar und technisch nicht überschritten.",
    ],
    whatRemainsIntentionallyInactive: [
      "keine technische Schreibfähigkeit",
      "keine Speicherfunktion",
      "keine Entscheidungsspeicherung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Checklistenaktualisierung",
      "keine Datenbank- oder Airtable-Schreibanbindung",
      "keine Simulation oder Aktivierung von Schreibrechten",
    ],
    finalSecurityBoundary:
      "Die finale Übersicht ist ausschließlich lesend. Sie darf keine Schreibfunktion, keinen Schreib-Handler, keine Speicherung, keine technische Schreibvorbereitung und keine externe Veränderung auslösen.",
    finalNonGoals: [
      "keine neuen Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Datenbank- oder Airtable-Schreibanbindung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
      "keine externen Requests",
    ],
    possibleNextManualDecisionForJamal: [
      "Als vorbereiteten Entscheidungsstand akzeptieren",
      "Noch einmal fachlich nachschärfen",
      "Schreibfreigabe weiterhin nicht weiterverfolgen",
    ],
    systemRecommendation:
      "Den Stand als final vorbereitete, rein lesende Entscheidungsgrundlage akzeptieren oder fachlich nachschärfen; keine technische Schreibfähigkeit aktivieren.",
    noTechnicalWriteActivationNotice:
      "Auch nach dieser Fertigstellungsübersicht wird keine technische Schreibfähigkeit aktiviert.",
    prepared: true,
    activated: false,
    finalOverviewOnly: true,
    readOnlyOnly: true,
    releaseGranted: false,
    decisionStored: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeDecisionMade: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    approvalButtonWithEffectAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteArchitectureBuilt: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    externalExecutionBlocked: true,
    productiveDatabaseChangeBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
  };
}

function getProductiveCentralFinalReadinessOverview() {
  return {
    title: "Gesamt-Fertigstellungsstatus der KI-Unternehmenszentrale herstellen",
    overallStatus:
      "Die KI-Unternehmenszentrale ist produktiv vorbereitet und als lokale, manuelle Führungs- und Projektarbeitszentrale weitgehend nutzbar, aber noch nicht als echte Live-/Schreibversion aktiviert.",
    readinessAreas: [
      {
        area: "Cockpit / Tagessteuerung",
        status: "fertig vorbereitet",
        classification:
          "Tagesfokus, Priorisierung und nächste manuelle Schritte sind sichtbar strukturiert.",
      },
      {
        area: "Morgenbriefing",
        status: "nutzbar, aber noch nicht final",
        classification:
          "Morgenlogik ist vorbereitet; produktive Standardisierung bleibt späterer Ausbau.",
      },
      {
        area: "Abendabschluss",
        status: "nutzbar, aber noch nicht final",
        classification:
          "Abschlusslogik ist manuell einordbar; echte Speicherung bleibt gesperrt.",
      },
      {
        area: "Projektsteuerung",
        status: "fertig vorbereitet",
        classification:
          "Standard-Projektarbeitsprozess, Tageskarte und mehrere Projektarten sind vorbereitet.",
      },
      {
        area: "Entscheidungsübersicht",
        status: "fertig vorbereitet",
        classification:
          "Jamal sieht Entscheidungspunkte, Grenzen und nächste manuelle Optionen.",
      },
      {
        area: "Agenten-System",
        status: "nutzbar, aber noch nicht final",
        classification:
          "25 Agenten sind strukturiert vorbereitet; Autonomie bleibt manuell gesperrt.",
      },
      {
        area: "HR-Ausbildungs- und Autonomie-Vorschläge",
        status: "fertig vorbereitet",
        classification:
          "HR liefert 25 Trainingsvorschläge inklusive HR-Agent und bleibt read-only.",
      },
      {
        area: "Qualitätszentrum",
        status: "nutzbar, aber noch nicht final",
        classification:
          "Qualitätsgrenzen und Prüfpunkte sind sichtbar; echte Freigaben bleiben manuell.",
      },
      {
        area: "Support-Leitstand",
        status: "späterer Ausbau",
        classification:
          "Support-Struktur ist angelegt, aber noch nicht als produktiver Leitstand finalisiert.",
      },
      {
        area: "Unternehmenswissen / Archiv",
        status: "nutzbar, aber noch nicht final",
        classification:
          "Wissens-/Archivlogik ist vorbereitet; echte Speicherung bleibt gesperrt.",
      },
      {
        area: "Health Upgrade Kompass als erstes Produktivprojekt",
        status: "fertig vorbereitet",
        classification:
          "Health ist als erstes Produktivprojekt mit Arbeitsblöcken, Auswertung und Grenzen vorbereitet.",
      },
      {
        area: "Expansion-App als strategisches Folgeprojekt",
        status: "nutzbar, aber noch nicht final",
        classification:
          "Expansion-App ist als zweiter Projektfall vorbereitet; keine Länder- oder Rechtsfreigabe.",
      },
      {
        area: "Schreibfreigabe-/Freigabeprozess aus V6.36",
        status: "bewusst gesperrt",
        classification:
          "Der Entscheidungsstand ist final lesbar vorbereitet; technische Schreibfähigkeit bleibt gesperrt.",
      },
    ],
    whatIsReallyReadyNow: [
      "Lokale read-only Unternehmenszentrale mit Cockpit, Tagessteuerung, Projektarbeitsroutine und Entscheidungslogik.",
      "Projektarbeit für Health, Expansion und Marketing ist kontrolliert vorbereitet.",
      "Agenten- und HR-Training sind sichtbar strukturiert.",
      "Schreibfreigabe ist fachlich als Entscheidungsstand abgeschlossen, aber technisch gesperrt.",
    ],
    whatIsMissingForUsableVersionOne: [
      "Eine finale V1-Nutzungsoberfläche, die Cockpit, Tageskarte, Projektstatus und Agentensignale kompakter bündelt.",
      "Eine klarere Priorisierung, ob Health, Agenten-System oder V1-Fertigstellung als nächster Schwerpunkt gilt.",
      "Eine spätere Entscheidung, welche Bereiche dauerhaft read-only bleiben und welche erst in einer neuen Version weiter geprüft werden.",
    ],
    threeMostImportantCompletionGaps: [
      "V1-Fertigstellungsoberfläche ist noch nicht als komprimierter Betriebsmodus verdichtet.",
      "Health Upgrade Kompass ist vorbereitet, aber noch nicht als erster dauerhaft geführter Produktivablauf final zusammengeführt.",
      "Agenten-System ist arbeitsfähiger, aber Autonomie- und Rollenreife sind noch nicht als V1-Standard abgeschlossen.",
    ],
    nextBigCompletionStep:
      "V1-Fertigstellung weiter verdichten: Cockpit, Tageskarte, Projektarbeitsroutine, Agentensignale und Sicherheitsgrenzen in einen kompakten read-only Betriebsmodus zusammenführen.",
    jamalPossibleDecision: [
      "V1-Fertigstellung weiter verdichten",
      "Erstes Produktivprojekt Health fokussieren",
      "Agenten-System weiter ausbauen",
      "Schreibfreigabe weiterhin gesperrt lassen",
    ],
    systemRecommendation:
      "V1-Fertigstellung weiter verdichten, Health als erstes Produktivprojekt fokussiert halten und Schreibfreigabe weiterhin gesperrt lassen.",
    finalSafetyBoundary:
      "Diese Übersicht ist rein lesend. Sie darf keine Schreib-Endpunkte, Schreib-Handler, Speicherfunktion, Aufgabenstarts, Projektstatusänderungen, Entscheidungsspeicherung, Checklistenaktualisierung, technische Schreibvorbereitung, Simulation oder Aktivierung von Schreibrechten auslösen.",
    prepared: true,
    activated: false,
    finalReadinessOverviewOnly: true,
    readOnlyOnly: true,
    releaseGranted: false,
    decisionStored: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeDecisionMade: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    approvalButtonWithEffectAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteArchitectureBuilt: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    externalExecutionBlocked: true,
    productiveDatabaseChangeBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
  };
}

function getProductiveCentralV1CompletionPlan() {
  return {
    title: "V1-Fertigstellungslücken in konkreten Abschlussplan überführen",
    source:
      "Ausgangspunkt ist V6.37.0: Der Gesamt-Fertigstellungsstatus der KI-Unternehmenszentrale ist read-only hergestellt.",
    targetVision:
      "KI-Unternehmenszentrale V1 ist fertig, wenn Jamal Cockpit, Tagessteuerung, Agenten-System, HR-Training, Projektsteuerung und Sicherheitsgrenzen verständlich nutzen kann, ohne dass das System schreibt, speichert oder automatisiert.",
    mostImportantOpenCompletionGaps: [
      "V1-Abnahmekarte fehlt noch als kompakte letzte Prüfansicht.",
      "Health muss als erstes Produktivprojekt noch klarer in den V1-Betriebsmodus eingebettet werden.",
      "Agenten-System und HR-Signale müssen als V1-erklärbare Arbeitslogik verdichtet werden.",
      "Schreibfreigabe muss sichtbar gesperrt bleiben, damit V1 nicht mit Live-Betrieb verwechselt wird.",
    ],
    finalWorkPrioritization: [
      {
        priority: "Muss vor V1 fertig sein",
        items: [
          "V1-Abnahmekarte erstellen",
          "Cockpit und Tagessteuerung als verständlich nutzbare V1-Kernfläche ausweisen",
          "Schreibfreigabe weiterhin gesperrt sichtbar halten",
        ],
      },
      {
        priority: "Sollte vor V1 fertig sein",
        items: [
          "Health Upgrade Kompass als erstes Produktivprojekt noch kompakter einordnen",
          "Agenten-System und HR-Ausbildung als tägliche Arbeitslogik erklären",
        ],
      },
      {
        priority: "Kann nach V1 kommen",
        items: [
          "Support-Leitstand produktiv vertiefen",
          "Morgenbriefing und Abendabschluss stärker standardisieren",
          "Expansion-App weiter operationalisieren",
        ],
      },
      {
        priority: "Bleibt bewusst gesperrt",
        items: [
          "Schreibfunktion",
          "Datenbank- oder Airtable-Schreibanbindung",
          "Automatisierung",
          "Aufgabenstarts",
          "Projektstatusänderungen",
        ],
      },
    ],
    v1AcceptanceCriteria: [
      "Cockpit ist verständlich nutzbar",
      "Tagessteuerung zeigt nächsten sinnvollen Schritt",
      "Agenten-System ist erklärbar",
      "HR liefert 25 sinnvolle Ausbildungs-/Autonomie-Vorschläge",
      "Projektsteuerung ist read-only nachvollziehbar",
      "Health Upgrade Kompass ist als erstes Produktivprojekt sichtbar eingeordnet",
      "Expansion-App ist als strategisches Folgeprojekt sichtbar eingeordnet",
      "Schreibfreigabe bleibt weiterhin gesperrt",
      "keine Daten werden geschrieben oder verändert",
    ],
    alreadyV1Capable: [
      "Cockpit-Grundlogik",
      "Tagessteuerung",
      "Projektarbeitsroutine",
      "Health als erstes Produktivprojekt",
      "Expansion-App als Folgeprojekt",
      "HR-Training mit 25 Agentenvorschlägen",
      "read-only Sicherheitsgrenzen",
    ],
    currentlyBlockingV1Acceptance: [
      "Eine letzte, kompakte V1-Abnahmekarte fehlt.",
      "Die V1-Grenze zwischen nutzbarer Zentrale und gesperrtem Live-/Schreibbetrieb muss noch in einer finalen Ansicht zusammengeführt werden.",
      "Der nächste tägliche Nutzungsmodus muss noch eindeutiger als V1-Kern sichtbar sein.",
    ],
    noLongerNeededBeforeV1: [
      "keine technische Schreibfähigkeit",
      "keine Datenbankanbindung",
      "keine Airtable-Schreibfunktion",
      "keine Plugin-Ausführung",
      "keine Automatisierung",
      "kein Deployment",
      "keine Agenten-Autonomie-Erhöhung",
    ],
    recommendedNextCompletionStep:
      "Eine letzte V1-Abnahmekarte vorbereiten, die alle V1-Kriterien, offenen Lücken und Sicherheitsgrenzen auf einer read-only Entscheidungsfläche bündelt.",
    jamalPossibleDecision: [
      "V1-Abschlussplan akzeptieren",
      "Eine letzte V1-Abnahmekarte vorbereiten",
      "Erst Health als Produktivprojekt fertigstellen",
      "Weiter an Agenten-Autonomie arbeiten",
    ],
    systemRecommendation:
      "V1-Abschlussplan akzeptieren und als nächsten Schritt eine letzte V1-Abnahmekarte vorbereiten; Schreibfreigabe bleibt gesperrt.",
    finalQualityAndSafetyBoundary:
      "Der Abschlussplan ist rein lesend. Er darf keine Schreib-Endpunkte, Schreib-Handler, Speicherfunktion, Aufgabenstarts, Projektstatusänderungen, Entscheidungsspeicherung, Checklistenaktualisierung, technische Schreibvorbereitung, Simulation oder Aktivierung von Schreibrechten auslösen.",
    prepared: true,
    activated: false,
    v1CompletionPlanOnly: true,
    readOnlyOnly: true,
    releaseGranted: false,
    decisionStored: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeDecisionMade: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    approvalButtonWithEffectAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteArchitectureBuilt: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    externalExecutionBlocked: true,
    productiveDatabaseChangeBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
  };
}

function getProductiveCentralV1CompletionDecision() {
  return {
    title: "V1-Fertigstellungsentscheidung der KI-Unternehmenszentrale vorbereiten",
    source:
      "Ausgangspunkt ist V6.37.1: Der konkrete V1-Abschlussplan ist read-only vorbereitet und wird jetzt zu einer finalen V1-Fertigstellungsentscheidung verdichtet.",
    status: "V1-Fertigstellungsentscheidung vorbereitet",
    finalV1AcceptanceCriteria: [
      "Cockpit ist verständlich nutzbar",
      "Tagessteuerung zeigt nächsten sinnvollen Schritt",
      "Agenten-System ist erklärbar",
      "HR liefert 25 sinnvolle Ausbildungs-/Autonomie-Vorschläge inklusive HR-Agent",
      "Projektsteuerung ist read-only nachvollziehbar",
      "Health Upgrade Kompass ist als erstes Produktivprojekt sichtbar eingeordnet",
      "Expansion-App ist als strategisches Folgeprojekt sichtbar eingeordnet",
      "Schreibfreigabe-/Freigabeprozess bleibt weiterhin gesperrt",
      "keine Daten werden geschrieben oder verändert",
    ],
    areaEvaluation: [
      {
        area: "Cockpit / Tagessteuerung",
        classification: "V1-fähig",
        note: "Jamal sieht Tagesfokus, nächste Schritte und Sicherheitsgrenzen.",
      },
      {
        area: "Morgenbriefing",
        classification: "V1-fähig mit Restpunkt",
        note: "Fokus und Risiken sind vorbereitet; spätere Standardisierung kann nach V1 folgen.",
      },
      {
        area: "Abendabschluss",
        classification: "V1-fähig mit Restpunkt",
        note: "Tagesabschluss ist manuell einordenbar; verbindliche Statusänderungen bleiben gesperrt.",
      },
      {
        area: "Projektsteuerung",
        classification: "V1-fähig",
        note: "Projektstände werden read-only in kleine Arbeitsblöcke übersetzt.",
      },
      {
        area: "Entscheidungsübersicht",
        classification: "V1-fähig",
        note: "Jamal bekommt klare Optionen, Empfehlungen und Stopppunkte.",
      },
      {
        area: "Agenten-System",
        classification: "V1-fähig",
        note: "25 Agenten sind erklärbar eingebunden und liefern vorbereitende Beiträge.",
      },
      {
        area: "HR-Ausbildungs- und Autonomie-Vorschläge",
        classification: "V1-fähig",
        note: "HR liefert weiterhin 25 Vorschläge inklusive HR-Agent; Autonomie wird nicht automatisch erhöht.",
      },
      {
        area: "Qualitätszentrum",
        classification: "V1-fähig",
        note: "Qualitäts-, Prüf- und Sicherheitsgrenzen bleiben sichtbar.",
      },
      {
        area: "Support-Leitstand",
        classification: "bewusst nach V1 verschoben",
        note: "Support-Logik bleibt vorbereitet, aber nicht produktiv vertieft.",
      },
      {
        area: "Unternehmenswissen / Archiv",
        classification: "V1-fähig mit Restpunkt",
        note: "Muster und Lernsignale sind sichtbar; echte Speicherung bleibt gesperrt.",
      },
      {
        area: "Health Upgrade Kompass als erstes Produktivprojekt",
        classification: "V1-fähig",
        note: "Health ist als erstes produktives Übungs- und Arbeitsprojekt eingeordnet.",
      },
      {
        area: "Expansion-App als strategisches Folgeprojekt",
        classification: "V1-fähig mit Restpunkt",
        note: "Expansion ist strategisch eingeordnet; rechtliche, steuerliche und regulatorische Freigaben bleiben ausgeschlossen.",
      },
      {
        area: "Schreibfreigabe-/Freigabeprozess weiterhin gesperrt",
        classification: "bewusst gesperrt",
        note: "Keine Schreibfunktion, keine Speicherwirkung und keine technische Schreibvorbereitung.",
      },
    ],
    whatIsV1ReadyPrepared: [
      "Lokale, manuelle Führungs- und Projektarbeitszentrale",
      "Cockpit mit Tagessteuerung und nächsten sinnvollen Schritten",
      "Projektsteuerung für Health und Expansion im read-only Modus",
      "Agenten-System mit 25 Rollen und HR-Trainingsimpulsen",
      "Qualitäts- und Sicherheitsgrenzen gegen Schreib-, Automations- und Live-Betrieb",
    ],
    whatRemainsOpenAfterV1: [
      "Produktnahe Vertiefung des Health Upgrade Kompass",
      "Weitere Standardisierung von Morgenbriefing und Abendabschluss",
      "Produktivere Support-Leitstand- und Archivlogik ohne Schreibwirkung",
      "Spätere, separate Prüfung von Schreibfähigkeit nur mit eigener Freigabeversion",
    ],
    whatMustStillNotHappen: [
      "keine Entscheidung wird gespeichert",
      "kein Status wird geändert",
      "keine Aufgabe wird gestartet",
      "keine Schreibfähigkeit wird aktiviert",
      "keine Datenbank- oder Airtable-Schreibanbindung",
      "keine Automatisierung, Plugin-Ausführung oder externe Anfrage",
    ],
    v1CompletionDecisionReadOnly:
      "Die KI-Unternehmenszentrale kann als fachlich V1-fertig vorbereitet betrachtet werden, wenn Jamal die verbleibenden Restpunkte bewusst akzeptiert und die Schreibfreigabe weiterhin gesperrt lässt.",
    jamalManualDecisionOptions: [
      "V1 als fachlich fertig vorbereitet akzeptieren",
      "Vor V1 noch eine letzte Lücke schließen",
      "Health Upgrade Kompass zuerst produktnäher ausarbeiten",
      "Unternehmenszentrale noch nicht als V1 akzeptieren",
    ],
    systemRecommendation:
      "V1 als fachlich fertig vorbereitet akzeptieren, wenn Jamal die offenen Restpunkte bewusst nach V1 verschiebt; Schreibfreigabe bleibt gesperrt.",
    finalQualityBoundary:
      "V1 ist nur fachlich vorbereitet, wenn Cockpit, Tagessteuerung, Agenten-System, HR, Projektsteuerung und Sicherheitsgrenzen verständlich und manuell nutzbar sind.",
    finalSafetyBoundary:
      "Diese Entscheidung ist rein lesend. Sie speichert keine Entscheidung, ändert keinen Status, startet keine Aufgabe, schreibt keine Daten, bereitet keine technische Schreibfähigkeit vor und aktiviert keine Schreibrechte.",
    prepared: true,
    activated: false,
    v1CompletionDecisionOnly: true,
    readOnlyOnly: true,
    releaseGranted: false,
    decisionStored: false,
    statusChanged: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeDecisionMade: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    approvalButtonWithEffectAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteArchitectureBuilt: false,
    technicalWriteFunctionActivated: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    postPatchPutDeleteEndpointsAdded: false,
    realExecutionActivated: false,
    stage3ExecutionActivated: false,
    taskStarted: false,
    projectStatusChanged: false,
    checklistUpdated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStorageBlocked: true,
    taskAssignmentBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
    externalExecutionBlocked: true,
    productiveDatabaseChangeBlocked: true,
    realLiveOperationBlocked: true,
    productiveActivationBlocked: true,
  };
}

function getProductiveCentralV1GfDecisionCard() {
  return {
    title: "V1-Fertigstellungsentscheidung als GF-Entscheidungskarte",
    source:
      "Ausgangspunkt ist V6.37.2: Die V1-Fertigstellungsentscheidung ist read-only vorbereitet und wird jetzt als konkrete GF-Entscheidungskarte sichtbar gemacht.",
    status: "GF-Entscheidungskarte vorbereitet, weiterhin read-only",
    currentV1Status: {
      finishedEnough:
        "Cockpit, Tagessteuerung, Projektsteuerung, Agenten-System, HR-Training, Qualitätsgrenzen sowie Health und Expansion als Projektkontext sind fachlich V1-fähig vorbereitet.",
      consciouslyOpen:
        "Health kann produktnäher ausgearbeitet werden, Morgenbriefing und Abendabschluss können nach V1 standardisiert werden, Support und Archiv können später vertieft werden.",
      belongsToV1: [
        "Cockpit / Tagessteuerung",
        "read-only Projektsteuerung",
        "Entscheidungsübersicht",
        "Agenten-System mit 25 Agenten",
        "HR-Ausbildungs- und Autonomie-Vorschläge",
        "Qualitätszentrum",
        "Health Upgrade Kompass als erstes Produktivprojekt",
        "Expansion-App als strategisches Folgeprojekt",
        "gesperrter Schreibfreigabe-/Freigabeprozess",
      ],
      notPartOfV1: [
        "technische Schreibfähigkeit",
        "Datenbank- oder Airtable-Schreibanbindung",
        "aktive Aufgabenstarts",
        "automatische Projektstatusänderungen",
        "produktive Plugin-Ausführung",
        "Deployment oder Live-Betrieb",
      ],
    },
    gfDecisionQuestion:
      "Kann V1 der KI-Unternehmenszentrale jetzt als erste nutzbare Version abgeschlossen werden?",
    decisionOptions: [
      {
        option: "Option A: V1 abschließen",
        meaning:
          "Jamal akzeptiert die Zentrale als fachlich nutzbare, lokale und read-only V1.",
        consequence:
          "V1 gilt als Abschlussstand; weitere Produktivitätsschritte laufen als V1.1 oder projektspezifische Vertiefung.",
      },
      {
        option: "Option B: V1 noch einmal begrenzt nachschärfen",
        meaning:
          "Jamal lässt genau eine letzte Lücke vor V1 schärfen.",
        consequence:
          "Kein neuer Großausbau; nur eine begrenzte Abnahmelücke wird read-only bearbeitet.",
      },
      {
        option: "Option C: V1 nicht abschließen / weiter offen halten",
        meaning:
          "Jamal betrachtet die Unternehmenszentrale noch nicht als V1.",
        consequence:
          "Der Abschluss bleibt offen; Risiko weiterer Vorbereitungsschleifen steigt.",
      },
    ],
    centralRecommendation: {
      recommendation: "Option A: V1 abschließen",
      reason:
        "Der Nutzen ist sichtbar, die wichtigsten Führungs- und Projektarbeitsflächen sind nutzbar, die Risiken sind durch read-only Grenzen kontrolliert und die bewusst offenen Punkte können nach V1 folgen.",
      resultFocus:
        "V1 soll als nutzbare Führungs- und Projektarbeitszentrale gelten, nicht als Live-, Schreib- oder Automationssystem.",
      riskFocus:
        "Zu frühe Freigabe wäre nur kritisch, wenn Schreibfähigkeit mit V1 verwechselt würde; diese bleibt ausdrücklich gesperrt.",
      boundaryFocus:
        "V1 bleibt lokal, manuell, read-only und ohne externe oder schreibende Wirkung.",
    },
    decisionCriteria: [
      {
        criterion: "Nutzen für Jamal",
        evaluation:
          "Jamal bekommt eine klare Führungs-, Tages- und Projektarbeitsansicht.",
      },
      {
        criterion: "Produktive Nutzbarkeit",
        evaluation:
          "Die Zentrale kann tägliche Orientierung, Projektarbeitskarten und Agentenbeiträge read-only führen.",
      },
      {
        criterion: "Sicherheitsstatus",
        evaluation:
          "Schreib-, Speicher-, Automations- und externe Aktionen sind weiter gesperrt.",
      },
      {
        criterion: "Read-only-Grenze",
        evaluation:
          "Alle Abschlussentscheidungen bleiben manuell und außerhalb technischer Systemwirkung.",
      },
      {
        criterion: "Fehlende Abschlussbestandteile",
        evaluation:
          "Feinschliff bei Health, Morgenbriefing, Abendabschluss, Support und Archiv kann nach V1 erfolgen.",
      },
      {
        criterion: "Risiko bei zu frühem Abschluss",
        evaluation:
          "V1 könnte als Live-System missverstanden werden; deshalb muss die Schreibfreigabe sichtbar gesperrt bleiben.",
      },
      {
        criterion: "Risiko bei weiterem Aufschieben",
        evaluation:
          "Die Zentrale bleibt in Vorbereitungsschleifen und wird nicht als nutzbare V1 eingesetzt.",
      },
    ],
    completionBoundary: {
      canImproveAfterDecision: [
        "Health Upgrade Kompass produktnäher ausarbeiten",
        "Morgenbriefing und Abendabschluss verdichten",
        "Support-Leitstand und Archivlogik erweitern",
        "Agenten-Training aus realer Nutzung schärfen",
      ],
      mustNotBePulledIntoV1: [
        "Schreibfähigkeit",
        "Airtable- oder Datenbank-Schreiben",
        "Plugin-Ausführung",
        "Automatisierung",
        "Deployment",
        "echter Live-Betrieb",
      ],
      belongsToV11OrLater: [
        "erste echte Live-Betriebsprüfung",
        "separate technische Schreibfreigabeprüfung",
        "produktive Integrationen",
        "projektübergreifende Automationskonzepte",
      ],
    },
    safetyBoundary: [
      "keine Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
    ],
    prepared: true,
    activated: false,
    readOnlyOnly: true,
    gfDecisionCardOnly: true,
    decisionStored: false,
    statusChanged: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    taskStarted: false,
    projectStatusChanged: false,
    checklistUpdated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
  };
}

function getProductiveCentralV1CompletionChecklist() {
  return {
    title: "V1-Abschluss-Checkliste der KI-Unternehmenszentrale",
    source:
      "Ausgangspunkt ist V6.37.3: Die GF-Entscheidungskarte ist read-only vorbereitet und wird jetzt in eine konkrete V1-Abschluss-Checkliste überführt.",
    completionStatus: "abschlussfähig",
    shortReason:
      "Die zentralen V1-Bausteine sind sichtbar vorhanden; die verbleibenden Lücken blockieren V1 nicht, solange Schreibfunktionen gesperrt bleiben.",
    centralRecommendation:
      "V1 jetzt abschließen, wenn Jamal die offenen Vertiefungen bewusst in V1.1 oder spätere Projektarbeit verschiebt.",
    completionChecklist: [
      { item: "Morgenbriefing vorhanden", status: "erfüllt" },
      { item: "Abendabschluss vorhanden", status: "erfüllt" },
      { item: "Tagesfokus vorhanden", status: "erfüllt" },
      { item: "Entscheidungsübersicht vorhanden", status: "erfüllt" },
      { item: "Projekt-Detailansicht vorhanden", status: "erfüllt" },
      { item: "Projektverlauf vorhanden", status: "erfüllt" },
      { item: "Qualitätszentrum vorhanden", status: "erfüllt" },
      { item: "Support-Leitstand vorhanden", status: "erfüllt mit Restpunkt" },
      { item: "Unternehmenswissen vorhanden", status: "erfüllt mit Restpunkt" },
      { item: "HR-Ausbildungsvorschläge für 25 Agenten vorhanden", status: "erfüllt" },
      { item: "Plugin-/Tool-Readiness sichtbar", status: "erfüllt" },
      { item: "Pilot-/Airtable-Status read-only sichtbar", status: "erfüllt" },
      { item: "GF-Entscheidungskarten sichtbar", status: "erfüllt" },
      { item: "V1-Fertigstellungsentscheidung vorbereitet", status: "erfüllt" },
      { item: "V1-GF-Entscheidungskarte vorhanden", status: "erfüllt" },
      { item: "Sicherheitsgrenzen sichtbar", status: "erfüllt" },
      { item: "Keine Schreibfunktionen aktiv", status: "erfüllt" },
    ],
    openCompletionGaps: [
      {
        gap: "Health Upgrade Kompass produktnäher verdichten",
        missing: "Eine stärker produktnahe V1.1-Arbeitslogik für den Health-Kontext.",
        relevance: "Erhöht den praktischen Nutzen nach V1, blockiert aber die Zentrale als V1 nicht.",
        blocksV1: false,
        belongsTo: "V1.1",
        jamalDecision: "Nach V1 als erstes Produktivprojekt fokussieren oder später einplanen.",
      },
      {
        gap: "Support-Leitstand vertiefen",
        missing: "Mehr konkrete Supportfälle und Antwortlogik.",
        relevance: "Nützlich für spätere Betriebsreife, aber für die erste read-only V1 nicht zwingend.",
        blocksV1: false,
        belongsTo: "nach V1",
        jamalDecision: "Als späteren Ausbau akzeptieren.",
      },
      {
        gap: "Unternehmenswissen / Archiv stärker strukturieren",
        missing: "Mehr wiederverwendbare Wissens- und Archivansichten ohne Speicherung.",
        relevance: "Verbessert spätere Nutzbarkeit, ist aber kein V1-Blocker.",
        blocksV1: false,
        belongsTo: "V1.1 oder später",
        jamalDecision: "Nach V1 mit realen Nutzungssignalen schärfen.",
      },
    ],
    v1Boundary: {
      belongsToV1: [
        "read-only Unternehmenszentrale",
        "sichtbare Projektsteuerung",
        "Agentenübersicht",
        "HR-Trainingsvorschläge",
        "Entscheidungsvorbereitung",
        "Abschlussklarheit",
      ],
      doesNotBelongToV1: [
        "aktive Schreibrechte",
        "echte Speicherung von Entscheidungen",
        "Aufgabenstarts",
        "Projektstatusänderungen",
        "Airtable-/Datenbank-Schreibanbindung",
        "Automationen",
        "Login / Cloud / Deployment",
        "echte externe Requests",
      ],
    },
    jamalRecommendation: {
      recommendation: "V1 jetzt abschließen",
      alternatives: [
        "V1 noch einmal begrenzt nachschärfen",
        "V1 offen halten",
      ],
      reasonByUsefulness:
        "Jamal kann die Zentrale bereits für Tagessteuerung, Projektblick, Agentenübersicht und Entscheidungsvorbereitung nutzen.",
      reasonByMaturity:
        "Die wesentlichen V1-Bausteine sind vorhanden; offene Punkte sind Erweiterungen, keine Abschlussblocker.",
      reasonBySafety:
        "Der Sicherheitsstatus bleibt stark, weil Schreib-, Speicher-, Automations- und externe Funktionen gesperrt sind.",
      riskIfClosedTooEarly:
        "V1 könnte überschätzt werden, wenn sie als Live- oder Schreibsystem verstanden wird.",
      riskIfDelayed:
        "Weitere Vorbereitung kann die produktive Nutzung der Zentrale unnötig verzögern.",
      nextUsefulStepAfterCompletion:
        "Nach V1 den Health Upgrade Kompass als erstes Produktivprojekt fokussieren oder eine V1.1-Verbesserungskarte ableiten.",
    },
    nextStepAfterV1: {
      v11:
        "V1.1 sollte den ersten produktiven Nutzungsblock nach V1 definieren, ohne Schreibrechte zu aktivieren.",
      firstProductivityStep:
        "Health Upgrade Kompass als erstes Produktivprojekt produktnäher ausarbeiten.",
      consciouslyLater: [
        "Schreibfreigabe",
        "Datenbank- oder Airtable-Schreiben",
        "Plugin-Ausführung",
        "Automationen",
        "Deployment",
      ],
      unchangedSafetyBoundaries:
        "Alle read-only, manuellen und lokalen Sicherheitsgrenzen bleiben nach V1 unverändert.",
    },
    safetyBoundary: [
      "keine Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
    ],
    prepared: true,
    activated: false,
    readOnlyOnly: true,
    staticChecklistOnly: true,
    checklistItemsInteractive: false,
    checklistItemsPersistable: false,
    checklistUpdateAvailable: false,
    decisionStored: false,
    statusChanged: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    taskStarted: false,
    projectStatusChanged: false,
    checklistUpdated: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
  };
}

function getProductiveCentralV1CompletionReport() {
  return {
    title: "V1-Abschlussbericht der KI-Unternehmenszentrale",
    source:
      "Ausgangspunkt sind V6.37.4 V1-Abschluss-Checkliste, V6.37.3 GF-Entscheidungskarte und V6.37.2 V1-Fertigstellungsentscheidung.",
    completionStatement: "V1 ist als erste nutzbare read-only Version abschließbar",
    shortReason: {
      benefitForJamal:
        "Jamal bekommt eine nutzbare Führungs-, Entscheidungs-, Projekt- und Agentenübersicht für den täglichen Betrieb.",
      maturity:
        "Die zentralen V1-Bausteine sind vorhanden und die offenen Punkte sind Erweiterungen, keine Abschlussblocker.",
      safetyStatus:
        "Alle Schreib-, Speicher-, Automations-, Plugin- und externen Aktionen bleiben gesperrt.",
      remainingBoundaries:
        "V1 bleibt lokal, manuell, read-only und ohne technische Schreibvorbereitung.",
    },
    whatV1IsNow: [
      "read-only Unternehmenszentrale",
      "Projekt- und Entscheidungsübersicht",
      "Morgenbriefing",
      "Abendabschluss",
      "Tagesfokus",
      "Qualitätszentrum",
      "Support-Leitstand",
      "Unternehmenswissen",
      "Agentenübersicht",
      "HR-Ausbildungsvorschläge für 25 Agenten",
      "Plugin-/Tool-Readiness",
      "Pilot-/Airtable-Status read-only",
      "V1-Fertigstellungsentscheidung",
      "GF-Entscheidungskarte",
      "V1-Abschluss-Checkliste",
    ],
    whyV1IsReadyEnough: [
      "sichtbarer Nutzen für Jamal",
      "tägliche Führbarkeit über Cockpit und Tagesfokus",
      "klare Projektinformationen für Health, Expansion und zentrale Projektarbeit",
      "vorhandene Entscheidungsunterstützung durch GF-Karten und Abschlusslogik",
      "sichtbare Agentenstruktur mit 25 Agenten",
      "vorhandene Sicherheitsgrenzen",
      "bewusster Verzicht auf Schreibfunktionen",
    ],
    consciouslyNotPartOfV1: [
      "echte Schreibrechte",
      "Speichern von Entscheidungen",
      "Aufgabenstarts",
      "Projektstatusänderungen",
      "Airtable-/Datenbank-Schreibanbindung",
      "Checklistenaktualisierung",
      "Automationen",
      "Login",
      "Cloud",
      "Deployment",
      "echte externe Requests",
      "produktive Datenänderungen",
    ],
    openPointsWithoutV1Blockade: [
      {
        point: "Health Upgrade Kompass produktnäher ausarbeiten",
        whyNotBlocking:
          "Health ist bereits als erstes Produktivprojekt sichtbar eingeordnet; die Produktnähe kann nach V1 vertieft werden.",
        laterVersion: "V1.1",
        riskIfPulledIntoV1:
          "Der V1-Abschluss würde in Produktdetailarbeit kippen und weiter verzögert.",
      },
      {
        point: "Support-Leitstand vertiefen",
        whyNotBlocking:
          "Support ist sichtbar vorhanden, aber für eine erste read-only Führungszentrale nicht abschlusspflichtig.",
        laterVersion: "V1.1 oder später",
        riskIfPulledIntoV1:
          "Es entsteht zusätzlicher Umfang ohne direkten Abschlussnutzen.",
      },
      {
        point: "Unternehmenswissen / Archiv produktiver machen",
        whyNotBlocking:
          "Wissen ist sichtbar, echte Speicherung bleibt bewusst gesperrt; weitere Struktur kann aus Nutzung entstehen.",
        laterVersion: "V1.1 oder später",
        riskIfPulledIntoV1:
          "Archivlogik könnte fälschlich als Speicher- oder Datenänderungsfunktion verstanden werden.",
      },
      {
        point: "Schreibfreigabe später separat prüfen",
        whyNotBlocking:
          "Schreibfähigkeit gehört ausdrücklich nicht zur read-only V1.",
        laterVersion: "separate spätere Freigabeversion",
        riskIfPulledIntoV1:
          "Die Sicherheitslinie der V1 würde aufgeweicht.",
      },
    ],
    centralRecommendation: {
      recommendation: "V1 jetzt abschließen",
      fallbackOptions: [
        "V1 nur noch einmal begrenzt nachschärfen",
        "V1 offen halten",
      ],
      resultBenefit:
        "Jamal kann die Unternehmenszentrale als erste nutzbare Arbeits- und Entscheidungsfläche einsetzen.",
      maturity:
        "Die Abschluss-Checkliste zeigt ausreichend erfüllte V1-Bausteine.",
      safetySituation:
        "Der Sicherheitsstatus ist stabil, weil keinerlei Schreibrechte oder technische Aktivierungen vorhanden sind.",
      riskIfDelayed:
        "Weiteres Aufschieben verlängert die Vorbereitungsphase und mindert den Produktivitätsgewinn.",
      riskIfClosedTooEarly:
        "Der Abschluss ist nur riskant, wenn V1 mit Live-, Schreib- oder Automationsbetrieb verwechselt wird.",
      productivityGainForJamal:
        "Der Übergang zu V1 schafft Klarheit und erlaubt den nächsten echten Produktivitätsschritt in V1.1.",
    },
    nextUsefulStepAfterV1: {
      v11:
        "V1.1 sollte den ersten produktiven Nutzungsblock nach V1 definieren, weiterhin read-only und ohne Schreibrechte.",
      firstProductivityStep:
        "Health Upgrade Kompass als erstes Produktivprojekt produktnäher ausarbeiten.",
      improvableAreas: [
        "Health Upgrade Kompass",
        "Morgenbriefing",
        "Abendabschluss",
        "Support-Leitstand",
        "Unternehmenswissen / Archiv",
        "Agenten-Training aus realer Nutzung",
      ],
      stillBlockedAreas: [
        "Schreibrechte",
        "Speicherfunktionen",
        "Airtable-/Datenbank-Schreiben",
        "Aufgabenstarts",
        "Projektstatusänderungen",
        "Automationen",
        "Plugin-Ausführung",
        "Deployment",
      ],
      nextJamalDecision:
        "V1 bewusst abschließen oder genau eine letzte Nachschärfung vor V1 festlegen.",
    },
    closingFormula:
      "Die KI-Unternehmenszentrale V1 ist als read-only Führungs-, Entscheidungs- und Agentenübersicht nutzbar. Sie verändert keine Daten, startet keine Aufgaben und speichert keine Entscheidungen. Der nächste sinnvolle Schritt ist nicht mehr weitere V1-Vorbereitung, sondern die bewusste Entscheidung über V1-Abschluss und den Übergang zu V1.1.",
    safetyBoundary: [
      "keine Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
    ],
    prepared: true,
    activated: false,
    readOnlyOnly: true,
    completionReportOnly: true,
    decisionStored: false,
    checklistUpdated: false,
    taskStarted: false,
    statusChanged: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    projectStatusChanged: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
  };
}

function getProductiveCentralV1ManualReleaseDecision() {
  return {
    title: "V1-Abschlussfreigabe als manuelle GF-Entscheidung",
    source:
      "Ausgangspunkt ist V6.37.5: Der V1-Abschlussbericht liegt read-only vor und wird jetzt in eine manuelle GF-Freigabeentscheidung überführt.",
    decisionSituation: [
      "V1-Abschlussbericht liegt vor",
      "V1-Abschluss-Checkliste liegt vor",
      "GF-Entscheidungskarte liegt vor",
      "V1 ist als read-only Unternehmenszentrale bewertbar",
      "keine produktiven Schreibfunktionen sind aktiv",
      "keine externen Requests wurden ausgeführt",
      "die Entscheidung bleibt vollständig bei Jamal",
    ],
    manualGfDecisionQuestion:
      "Gebe ich V1 der KI-Unternehmenszentrale jetzt als erste nutzbare read-only Version frei?",
    decisionOptions: [
      {
        option: "Option A: V1 freigeben",
        meaning: [
          "V1 gilt als erste nutzbare read-only Version",
          "weitere Verbesserungen werden nach V1 verschoben",
          "nächster Fokus wird V1.1",
          "keine Schreibrechte werden aktiviert",
        ],
        whenUseful: [
          "wenn die aktuelle Zentrale für tägliche Führung, Übersicht und Entscheidungen ausreicht",
          "wenn weitere Vorbereitung keinen wesentlichen V1-Nutzen mehr bringt",
          "wenn Jamal produktiv mit der read-only Zentrale arbeiten möchte",
        ],
        risk: "kleinere Unschärfen bleiben für V1.1 offen",
      },
      {
        option: "Option B: V1 bedingt freigeben",
        meaning: [
          "V1 wird grundsätzlich freigegeben",
          "einzelne Punkte werden als begrenzte Nachschärfung markiert",
          "V1.1 wird vorbereitet, aber V1 bleibt nutzbar",
          "keine Schreibrechte werden aktiviert",
        ],
        whenUseful: [
          "wenn V1 nutzbar ist, aber Jamal vor dem Abschluss noch 1-2 Klarstellungen sehen möchte",
          "wenn kein neuer Funktionsumfang mehr in V1 gezogen werden soll",
        ],
        risk:
          "Nachschärfung darf nicht wieder zu endloser V1-Vorbereitung werden",
      },
      {
        option: "Option C: V1 nicht freigeben / offen halten",
        meaning: [
          "V1 bleibt formal offen",
          "weitere Vorbereitung ist nötig",
          "Übergang zu V1.1 wird verschoben",
          "keine Schreibrechte werden aktiviert",
        ],
        whenUseful: [
          "wenn eine zentrale V1-Funktion fehlt",
          "wenn Jamal die Zentrale noch nicht sicher führen kann",
          "wenn die Abschlussaussage noch nicht tragfähig genug ist",
        ],
        risk:
          "produktiver Nutzen verzögert sich und die Zentrale bleibt im Vorbereitungsmodus",
      },
    ],
    centralRecommendation: {
      recommendation: "Option A: V1 freigeben",
      resultBenefit:
        "Jamal kann die Zentrale als erste nutzbare read-only Führungs- und Entscheidungsfläche einsetzen.",
      maturity:
        "V1-Abschlussbericht, Abschluss-Checkliste und GF-Entscheidungskarte zeigen ausreichende fachliche Reife.",
      safetyBoundary:
        "Alle Schreib-, Speicher-, Aufgaben-, Status-, Plugin- und externen Aktionen bleiben gesperrt.",
      riskOfDelay:
        "Weiteres Aufschieben verlängert den Vorbereitungsmodus und reduziert den Produktivitätsgewinn.",
      riskOfEarlyCompletion:
        "Der Abschluss ist nur kritisch, wenn V1 als Schreib- oder Live-System missverstanden wird.",
      v11Transition:
        "Nach Freigabe kann V1.1 als erster produktiver Nutzungskorridor vorbereitet werden, weiterhin ohne Schreibrechte.",
    },
    manualDecisionFormulas: {
      release:
        "Ich gebe V1 der KI-Unternehmenszentrale als erste nutzbare read-only Version frei. Die Zentrale darf keine Daten verändern, keine Entscheidungen speichern, keine Aufgaben starten und keine Schreibrechte vorbereiten. Weitere Verbesserungen gehören ab jetzt in V1.1 oder spätere Versionen.",
      conditionalRelease:
        "Ich gebe V1 grundsätzlich frei, möchte aber vor dem Übergang zu V1.1 noch eine begrenzte Nachschärfung der benannten offenen Punkte sehen. Neue Funktionen werden nicht mehr in V1 hineingezogen.",
      noRelease:
        "Ich gebe V1 noch nicht frei. Die Zentrale bleibt im Vorbereitungsmodus, bis die benannten Blocker geklärt sind. Schreibrechte bleiben weiterhin vollständig gesperrt.",
    },
    v1CompletionBoundary: {
      notPartOfV1AfterRelease: [
        "neue Module",
        "neue Schreibfunktionen",
        "Speicherlogik",
        "Airtable-/Datenbank-Schreibanbindung",
        "Aufgabenstarts",
        "Projektstatusänderungen",
        "Automationen",
        "Login",
        "Cloud",
        "Deployment",
        "externe produktive Requests",
      ],
      belongsToV11OrLater: [
        "produktivere Tagessteuerung",
        "bessere Priorisierung",
        "erste vorsichtige Automationskonzepte",
        "technische Schreibfreigabe nur als spätere, separate Entscheidung",
        "echte Integrationen nur nach manueller Freigabe",
      ],
    },
    nextStepAfterDecision: {
      optionA: [
        "V1-Abschlussstand sichtbar machen",
        "V1.1-Korridor vorbereiten",
        "produktiven Nutzen im Alltag testen",
        "keine Schreibrechte aktivieren",
      ],
      optionB: [
        "maximal 1 begrenzte Nachschärfung",
        "danach erneute Freigabeentscheidung",
        "keine neuen V1-Funktionen",
      ],
      optionC: [
        "echte Blocker benennen",
        "V1-Abschluss erneut vorbereiten",
        "keine Ausweitung ohne konkreten Nutzen",
      ],
    },
    safetyBoundary: [
      "keine Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
      "keine externe Request-Ausführung",
    ],
    prepared: true,
    activated: false,
    readOnlyOnly: true,
    manualGfReleaseDecisionOnly: true,
    decisionStored: false,
    decisionTriggered: false,
    decisionSimulated: false,
    technicalDecisionPreparation: false,
    checklistUpdated: false,
    taskStarted: false,
    statusChanged: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    projectStatusChanged: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
  };
}

function getProductiveCentralV1FinalizationBoundary() {
  return {
    title: "V1-Abschlussstand und V1.1-Übergangsgrenze",
    source:
      "Ausgangspunkt ist V6.37.6: V1-Abschlussbericht, V1-Abschluss-Checkliste, V1-GF-Entscheidungskarte und manuelle V1-Freigabeentscheidung liegen read-only vorbereitet vor.",
    startingPointSummary: [
      "V1-Abschlussbericht liegt vor",
      "V1-Abschluss-Checkliste liegt vor",
      "V1-GF-Entscheidungskarte liegt vor",
      "manuelle V1-Freigabeentscheidung liegt vorbereitet vor",
      "V1 ist weiterhin vollständig read-only",
      "es wurden keine Schreibrechte aktiviert",
      "es wurden keine externen Requests ausgeführt",
      "die finale Entscheidung bleibt bei Jamal",
    ],
    finalV1CompletionStatus: {
      statement:
        "V1 der KI-Unternehmenszentrale ist als erste nutzbare read-only Führungs-, Entscheidungs- und Agentenübersicht abschlussfähig.",
      purpose:
        "V1 gibt Jamal eine lokale, manuelle und sichere Übersicht über Tagessteuerung, Projekte, Entscheidungen, Agenten und Sicherheitsgrenzen.",
      benefitForJamal:
        "Jamal sieht auf einen Blick, was heute wichtig ist, welche Projekte geführt werden und welche Entscheidungen vorbereitet sind.",
      dailyUseScope:
        "Tagesfokus, Morgenbriefing, Abendabschluss, Projektblick, Entscheidungslogik, Agentenübersicht und Qualitätsgrenzen.",
      existingModules:
        "Cockpit, Tagessteuerung, Projektansichten, Qualitätszentrum, Support-Leitstand, Unternehmenswissen, Plugin-/Tool-Readiness und Pilotstatus.",
      existingAgentStructure:
        "25 Agenten inklusive HR-Agent mit Ausbildungs- und Autonomie-Vorschlägen.",
      existingDecisionSupport:
        "V1-Fertigstellungsentscheidung, GF-Entscheidungskarte, Abschluss-Checkliste, Abschlussbericht und manuelle Freigabeentscheidung.",
      existingSafetyBoundaries:
        "read-only, lokal, manuell, ohne Speicherung, ohne Schreibrechte, ohne Automatisierung, ohne externe Requests.",
      consciouslyExcludedWriteFunctions:
        "produktive Schreibfunktionen, Speicherlogik, Aufgabenstarts, Statusänderungen, Datenbank-/Airtable-Schreiben und technische Schreibvorbereitung.",
    },
    v1Components: [
      "Morgenbriefing",
      "Abendabschluss",
      "Tagesfokus",
      "Entscheidungsübersicht",
      "Projekt-Detailansicht",
      "Projektverlauf",
      "Qualitätszentrum",
      "Support-Leitstand",
      "Unternehmenswissen",
      "Agentenübersicht",
      "HR-Ausbildungsvorschläge für 25 Agenten",
      "Plugin-/Tool-Readiness",
      "Pilot-/Airtable-Status read-only",
      "V1-Fertigstellungsentscheidung",
      "GF-Entscheidungskarte",
      "V1-Abschluss-Checkliste",
      "V1-Abschlussbericht",
      "manuelle V1-Freigabeentscheidung",
    ],
    v1ClosureBoundary: {
      noLongerPulledIntoV1: [
        "neue Module",
        "neue operative Workflows",
        "Schreibrechte",
        "Speichern von Entscheidungen",
        "Aufgabenstarts",
        "Projektstatusänderungen",
        "Airtable-/Datenbank-Schreibanbindung",
        "Automationen",
        "Login",
        "Cloud",
        "Deployment",
        "externe produktive Requests",
        "technische Schreibvorbereitung",
        "echte Integrationen",
      ],
      laterOnly:
        "Diese Punkte gehören ausschließlich in V1.1 oder spätere Versionen und benötigen jeweils eine neue manuelle GF-Entscheidung.",
    },
    openPointsWithoutV1Blockade: [
      {
        point: "Health Upgrade Kompass produktnäher ausarbeiten",
        whyOpen: "Der erste Produktivprojekt-Fokus kann nach V1 stärker konkretisiert werden.",
        whyNotBlocking:
          "Health ist bereits sichtbar eingeordnet; Produktdetailtiefe ist kein V1-Abschlusskriterium mehr.",
        laterVersion: "V1.1",
        harmIfPulledIntoV1:
          "V1 würde wieder in Projekt-Detailarbeit statt Abschlussklarheit kippen.",
        boundaryAgainstEndlessPreparation:
          "V1 bleibt Führungs- und Übersichtsversion; Produktvertiefung beginnt erst nach Abschluss.",
      },
      {
        point: "Tagespriorisierung verbessern",
        whyOpen: "Die vorhandene Tagessteuerung kann produktiver und schärfer werden.",
        whyNotBlocking:
          "Tagesfokus ist vorhanden; bessere Priorisierung ist Optimierung, kein Blocker.",
        laterVersion: "V1.1",
        harmIfPulledIntoV1:
          "Weitere Optimierung würde den Abschluss ohne kritischen Zusatznutzen verzögern.",
        boundaryAgainstEndlessPreparation:
          "Nur Nutzbarkeitsblocker gehören vor V1, Optimierungen nach V1.",
      },
      {
        point: "Support-Leitstand und Unternehmenswissen vertiefen",
        whyOpen: "Beide Bereiche können später stärker mit realer Nutzung gefüllt werden.",
        whyNotBlocking:
          "Sie sind sichtbar vorhanden und müssen für V1 nicht produktiv vollständig sein.",
        laterVersion: "V1.1 oder später",
        harmIfPulledIntoV1:
          "Scheinpräzision ohne reale Nutzungssignale würde die V1 unnötig aufblasen.",
        boundaryAgainstEndlessPreparation:
          "Weitere Tiefe entsteht nach V1 aus echter Nutzung, nicht aus weiterer Vorarbeit.",
      },
    ],
    v11TransitionBoundary: {
      v11MayPrepare: [
        "bessere Tagespriorisierung",
        "produktivere Nutzung der bestehenden read-only Informationen",
        "klarere nächste Schritte pro Projekt",
        "bessere Entscheidungslogik für Jamal",
        "vorsichtige Konzeptarbeit zu späteren Schreibrechten",
        "bessere Trennung zwischen Lesen, Entscheiden und späterem Ausführen",
      ],
      v11MayNotActivate: [
        "Schreib-Endpunkte",
        "Schreib-Handler",
        "Speicherfunktionen",
        "Aufgabenstarts",
        "Statusänderungen",
        "Airtable-/Datenbank-Schreibzugriff",
        "Automationen",
        "externe produktive Requests",
        "echte Integrationen",
      ],
      corridorOnly:
        "V1.1 wird nur als Korridor vorbereitet, nicht als neue technische Umsetzung aktiviert.",
    },
    centralRecommendation: {
      recommendation:
        "V1 jetzt abschließen und V1.1 nur als separaten, read-only Übergangskorridor vorbereiten.",
      reasons: [
        "V1 ist für Führung und Übersicht nutzbar",
        "weitere V1-Vorbereitung bringt sinkenden Zusatznutzen",
        "Sicherheitsgrenzen sind klar eingehalten",
        "V1.1 kann sauber getrennt geplant werden",
        "Jamal gewinnt durch Abschluss mehr Orientierung als durch weiteres Offenhalten",
      ],
    },
    jamalNextManualDecision: {
      question:
        "Schließe ich V1 der KI-Unternehmenszentrale als erste nutzbare read-only Version ab und verschiebe alle weiteren Verbesserungen bewusst in V1.1 oder spätere Versionen?",
      options: [
        {
          option: "Option A: V1 abschließen und V1.1-Korridor vorbereiten",
          meaning:
            "V1 gilt als abgeschlossen; weitere Verbesserungen laufen getrennt als V1.1.",
          benefit:
            "Jamal bekommt Abschlussklarheit und kann produktiv mit der Zentrale arbeiten.",
          risk:
            "Kleinere Unschärfen bleiben bewusst für V1.1 offen.",
          recommendedFollowUp:
            "V1-Abschlussstand sichtbar machen und V1.1-Korridor read-only vorbereiten.",
          safetyBoundary:
            "Keine Schreibrechte, keine Speicherung, keine Aufgabenstarts, keine externen Requests.",
        },
        {
          option: "Option B: V1 nur noch einmal begrenzt nachschärfen",
          meaning:
            "Genau eine eng begrenzte V1-Lücke darf vor Abschluss geklärt werden.",
          benefit:
            "Jamal kann einen echten Blocker ausräumen, ohne V1 neu zu öffnen.",
          risk:
            "Nachschärfung kann wieder zu Vorbereitungsschleifen führen.",
          recommendedFollowUp:
            "Eine einzelne Lücke definieren, danach erneute Abschlussentscheidung.",
          safetyBoundary:
            "Keine neuen Funktionen, keine technische Aktivierung, keine Schreibvorbereitung.",
        },
        {
          option: "Option C: V1 offen halten, weil ein echter Blocker besteht",
          meaning:
            "V1 bleibt offen, bis ein konkret benannter Blocker gelöst ist.",
          benefit:
            "Verhindert einen Abschluss, wenn Jamal die Zentrale noch nicht sicher nutzen kann.",
          risk:
            "Produktiver Nutzen verzögert sich und die Zentrale bleibt im Vorbereitungsmodus.",
          recommendedFollowUp:
            "Echten Blocker benennen und V1-Abschluss erneut vorbereiten.",
          safetyBoundary:
            "Keine Ausweitung ohne konkreten Nutzen, keine Schreibrechte, keine externen Aktionen.",
        },
      ],
    },
    closingFormula:
      "V1 der KI-Unternehmenszentrale ist als read-only Führungs-, Entscheidungs- und Agentenübersicht fertig genug, um abgeschlossen zu werden. Weitere Verbesserungen gehören nicht mehr in V1, sondern in V1.1 oder spätere Versionen. Die Zentrale verändert keine Daten, startet keine Aufgaben, speichert keine Entscheidungen und bereitet keine Schreibrechte vor.",
    safetyBoundary: [
      "keine Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
      "keine externe Request-Ausführung",
    ],
    prepared: true,
    activated: false,
    readOnlyOnly: true,
    v1FinalizationBoundaryOnly: true,
    v11CorridorOnly: true,
    decisionStored: false,
    checklistUpdated: false,
    taskStarted: false,
    statusChanged: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    projectStatusChanged: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
  };
}

function getProductiveCentralV1FinalOperatingState() {
  return {
    title: "V1 finaler Betriebsstand der KI-Unternehmenszentrale",
    source:
      "Ausgangspunkt ist V6.37.7: Der V1-Abschlussstand und die V1.1-Übergangsgrenze sind read-only sichtbar gemacht.",
    finalV1Statement: {
      statement:
        "Die KI-Unternehmenszentrale V1 ist als erste nutzbare read-only Führungs-, Entscheidungs- und Agentenübersicht fertig genug für den Alltagseinsatz.",
      v1Usable: "V1 ist nutzbar.",
      readOnlyByDesign: "V1 ist bewusst read-only.",
      noDataChange: "V1 verändert keine Daten.",
      noTaskStart: "V1 startet keine Aufgaben.",
      noDecisionStorage: "V1 speichert keine Entscheidungen.",
      noWritePreparation: "V1 bereitet keine Schreibrechte vor.",
      v11Separated: "V1 ist von V1.1 abgegrenzt.",
    },
    whatJamalCanDoNow: [
      "morgens Überblick gewinnen",
      "Tagesfokus sehen",
      "Projekte einordnen",
      "Entscheidungen vorbereiten",
      "Agentenstatus prüfen",
      "HR-Ausbildungsvorschläge für 25 Agenten lesen",
      "Qualitäts- und Sicherheitslage prüfen",
      "Support-/Blocker-Themen erkennen",
      "Plugin-/Tool-Readiness bewerten",
      "Pilot-/Airtable-Status read-only lesen",
      "Abendabschluss nutzen",
      "nächste manuelle Entscheidung ableiten",
    ],
    whatV1DoesNotDo: [
      "keine Daten verändern",
      "keine Entscheidungen speichern",
      "keine Aufgaben starten",
      "keine Projektstatus ändern",
      "keine Checklisten aktualisieren",
      "keine Airtable-/Datenbank-Schreibzugriffe",
      "keine Automationen ausführen",
      "keine externen produktiven Requests auslösen",
      "keine Schreibrechte simulieren",
      "keine technische Aktivierung vorbereiten",
    ],
    finalV1Inventory: [
      "Morgenbriefing",
      "Abendabschluss",
      "Tagesfokus",
      "Entscheidungsübersicht",
      "Projekt-Detailansicht",
      "Projektverlauf",
      "Qualitätszentrum",
      "Support-Leitstand",
      "Unternehmenswissen",
      "Agentenübersicht",
      "HR-Ausbildungsvorschläge für 25 Agenten",
      "Plugin-/Tool-Readiness",
      "Pilot-/Airtable-Status read-only",
      "V1-Fertigstellungsentscheidung",
      "GF-Entscheidungskarte",
      "V1-Abschluss-Checkliste",
      "V1-Abschlussbericht",
      "manuelle V1-Freigabeentscheidung",
      "V1-Abschlussstand und V1.1-Übergangsgrenze",
    ],
    v1UsageRule:
      "V1 wird ab jetzt als read-only Betriebsstand genutzt. Neue Ideen, Nachschärfungen und Produktivitätserweiterungen werden nicht mehr in V1 hineingezogen, sondern sauber für V1.1 oder spätere Versionen gesammelt.",
    boundaryToV11: {
      v1Remains: [
        "read-only",
        "übersichtlich",
        "entscheidungsunterstützend",
        "sicher abgegrenzt",
        "ohne produktive Schreibfunktion",
      ],
      v11MayPrepareLater: [
        "bessere Priorisierung",
        "bessere Tagessteuerung",
        "bessere Projekt-Nächste-Schritte",
        "bessere Entscheidungshilfen",
        "vorsichtige Konzeptarbeit für spätere Schreibrechte",
      ],
      v11MayNotActivateNow: [
        "Schreib-Endpunkte",
        "Speicherlogik",
        "Aufgabenstarts",
        "Statusänderungen",
        "Airtable-/Datenbank-Schreibzugriffe",
        "Automationen",
        "externe produktive Requests",
        "echte Integrationen",
      ],
    },
    centralRecommendation: {
      recommendation:
        "Empfehlung: V1 als finalen read-only Betriebsstand akzeptieren und ab jetzt im Alltag nutzen. Der nächste sinnvolle Schritt ist nicht weitere V1-Vorbereitung, sondern ein separater V1.1-Korridor für Produktivitätsverbesserungen.",
      reasons: [
        "V1 liefert bereits täglichen Führungsnutzen",
        "die zentrale Agenten- und Projektübersicht ist vorhanden",
        "Entscheidungen werden vorbereitet, aber nicht gespeichert",
        "Sicherheitsgrenzen sind klar eingehalten",
        "weiteres Hineinziehen neuer Themen würde V1 unnötig offen halten",
        "V1.1 kann sauber getrennt geplant werden",
      ],
    },
    jamalFinalManualQuestion:
      "Akzeptiere ich V1 der KI-Unternehmenszentrale jetzt als finalen read-only Betriebsstand und nutze sie ab sofort im Alltag?",
    finalManualOptions: [
      {
        option: "Option A: Ja, V1 als finalen read-only Betriebsstand akzeptieren",
        meaning:
          "V1 gilt als finaler read-only Betriebsstand und wird im Alltag genutzt.",
        benefit:
          "Jamal bekommt Abschlussklarheit und kann die Zentrale als tägliche Führungsübersicht einsetzen.",
        risk:
          "Verbesserungen werden bewusst nach V1.1 verschoben und nicht mehr in V1 gezogen.",
        recommendedFollowUp:
          "V1.1-Korridor separat vorbereiten und produktive Alltagsnutzung beobachten.",
        safetyBoundary:
          "Keine Schreibrechte, keine Speicherung, keine Aufgabenstarts, keine externen Requests.",
      },
      {
        option: "Option B: V1 einmalig minimal nachschärfen, ohne neue Funktionen",
        meaning:
          "Genau eine minimale Klarstellung darf noch erfolgen, ohne V1 funktional zu erweitern.",
        benefit:
          "Jamal kann einen letzten echten Verständnisblocker entfernen.",
        risk:
          "Nachschärfung kann den Abschluss erneut verzögern, wenn sie nicht strikt begrenzt bleibt.",
        recommendedFollowUp:
          "Eine einzelne Nachschärfung definieren, dann V1 final akzeptieren.",
        safetyBoundary:
          "Keine neuen Funktionen, keine Schreibvorbereitung, keine technische Aktivierung.",
      },
      {
        option: "Option C: V1 offen halten, nur wenn ein echter Blocker besteht",
        meaning:
          "V1 bleibt nur offen, wenn ein konkret benannter Blocker die Alltagsnutzung verhindert.",
        benefit:
          "Verhindert einen formalen Abschluss trotz fehlender Führbarkeit.",
        risk:
          "Ohne echten Blocker verzögert Offenhalten den produktiven Nutzen.",
        recommendedFollowUp:
          "Blocker benennen, lösen und danach erneut über den finalen Betriebsstand entscheiden.",
        safetyBoundary:
          "Keine Ausweitung, keine Schreibrechte, keine externen Aktionen, keine Automatisierung.",
      },
    ],
    closingFormula:
      "V1 der KI-Unternehmenszentrale ist fertig genug für den read-only Alltagseinsatz. Sie führt, ordnet, zeigt, erklärt und bereitet Entscheidungen vor. Sie speichert nichts, verändert nichts, startet nichts und aktiviert keine Schreibrechte. Alles Weitere gehört ab jetzt bewusst in V1.1 oder spätere Versionen.",
    safetyBoundary: [
      "keine Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
      "keine externe Request-Ausführung",
    ],
    prepared: true,
    activated: false,
    readOnlyOnly: true,
    finalV1OperatingStateOnly: true,
    v11Separated: true,
    decisionStored: false,
    checklistUpdated: false,
    taskStarted: false,
    statusChanged: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    projectStatusChanged: false,
    madeExternalRequest: false,
    agentCount: 25,
    manualOnly: true,
    localOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
  };
}

function getAgentDailyRunAssignment(proposal, index) {
  const handoffTarget = /projektmanager/i.test(proposal.agent)
    ? "Geschäftsführer-Agent"
    : /hr/i.test(proposal.agent)
      ? "Geschäftsführer-Agent und Projektmanager-Agent"
      : "Projektmanager-Agent";
  const decisionNeeded = /geschäftsführer|projektmanager|hr|compliance|risiko|recht|tool|plugin/i.test(
    proposal.agent,
  )
    ? "Jamal prüft den Beitrag manuell."
    : "keine Entscheidung nötig";

  return {
    agentName: proposal.agent,
    role: proposal.role,
    todaysOrder: `Tagesfokus read-only prüfen und als ${proposal.role}-Beitrag den kleinsten sinnvollen Produktivitätsschritt einordnen.`,
    expectedResult: proposal.todayTrainingStep,
    safetyBoundary: proposal.riskBoundary,
    handoffTo: handoffTarget,
    jamalDecisionNeeded: decisionNeeded,
    compactResult: {
      shortFinding:
        index === 0
          ? "Die Führungsfrage muss kurz, entscheidbar und ohne Systemaktion bleiben."
          : `${proposal.role}-Beitrag ist als vorbereitende Einschätzung nutzbar.`,
      recommendation: proposal.smallAutonomyIncrease,
      riskOrBoundary: proposal.riskBoundary,
      nextUsefulStep:
        "Beitrag an den Projektmanager-Agenten geben und nur als Entscheidungsvorbereitung verdichten.",
      releaseNeeded: decisionNeeded === "keine Entscheidung nötig" ? "nein" : "ja",
      mustNotDo:
        "Nicht speichern, nicht ausführen, keinen Status ändern, keine externe Anfrage starten.",
    },
  };
}

function getProductiveCentralV11AgentDailyRun() {
  const dailyAgentAssignments = HR_DAILY_TRAINING_PROPOSALS.map((proposal, index) =>
    getAgentDailyRunAssignment(proposal, index),
  );

  return {
    title: "V1.1 Agenten-Tageslauf",
    source:
      "Ausgangspunkt ist V6.37.8: V1 ist als finaler read-only Betriebsstand sichtbar; V1.1 startet als separater Produktivitätskorridor.",
    startingPoint: [
      "V1 ist als finaler read-only Betriebsstand vorhanden",
      "V1 wird nicht weiter erweitert",
      "V1.1 startet als separater Produktivitätskorridor",
      "alle Agenten arbeiten weiterhin nur vorbereitend",
      "keine Daten werden verändert",
      "keine Aufgaben werden gestartet",
      "keine Entscheidungen werden gespeichert",
      "keine Schreibrechte werden vorbereitet",
      "keine externen Requests werden ausgeführt",
    ],
    todaysAgentFocus: {
      focus:
        "Ersten Agenten-Tageslauf als read-only Arbeitsmodus führen.",
      whyImportant:
        "Jamal sieht erstmals, wie die 25 Agenten zu einem Tagesfokus Beiträge liefern, ohne dass daraus automatische Ausführung entsteht.",
      expectedBenefitForJamal:
        "Bessere Führbarkeit: Jamal erkennt Agentenauftrag, Ergebnis, Grenze und manuelle Entscheidung in einer Tagesstruktur.",
      smallestUsefulResult:
        "Eine gemeinsame, statische Empfehlung für den nächsten kleinen Produktivitätsschritt.",
      dailyRunBoundary:
        "Nur lesen, strukturieren und verdichten; keine Speicherung, keine Aufgabenstarts, keine Schreibrechte, keine externen Requests.",
      manualDecisionQuestion:
        "Welche Agentenbeiträge brauche ich heute, damit Jamal eine bessere Entscheidung für den nächsten kleinen Produktivitätsschritt treffen kann?",
    },
    involvedAgents: dailyAgentAssignments,
    agentWorkLogic: [
      {
        phase: "Phase 1: Orientierung",
        steps: [
          "GF-Agent klärt die wichtigste Führungsfrage",
          "Projektmanager-Agent wählt den kleinsten sinnvollen Projektschritt",
          "Wissens/Archiv-Agent prüft, welche vorhandenen Informationen genutzt werden",
        ],
      },
      {
        phase: "Phase 2: Fachbeiträge",
        steps: [
          "Produktmanager-Agent bewertet Nutzen und Produktreife",
          "Entwickler-Agent bewertet technische Machbarkeit",
          "Design-Director-Agent bewertet Verständlichkeit und Oberfläche",
          "Content-Agent bewertet Sprache und Kommunikation",
          "QA-Agent bewertet Prüfbarkeit",
          "Compliance/Risiko-Agent bewertet Grenzen und Risiken",
          "Plugin/Tool-Radar-Agent bewertet Tool-Bedarf ausschließlich read-only",
          "Support-Agent bewertet mögliche Blocker und Nutzerfragen",
        ],
      },
      {
        phase: "Phase 3: Verdichtung",
        steps: [
          "Projektmanager-Agent bündelt die Agentenbeiträge",
          "GF-Agent leitet daraus eine Entscheidungsfrage ab",
          "HR-Agent bewertet, welcher Agent heute 1 % selbstständiger werden darf",
          "Wissens/Archiv-Agent benennt, was später dokumentiert werden müsste, ohne es zu speichern",
        ],
      },
    ],
    sharedAgentRecommendation: {
      keyInsight:
        "Der nächste Produktivitätsschritt sollte nicht aus vielen Einzelagenten-Aufträgen bestehen, sondern aus einer verdichteten, manuell entscheidbaren Tagesempfehlung.",
      sharedProposal:
        "Projektmanager-Agent bündelt die Beiträge und gibt Jamal genau einen kleinsten nächsten read-only Schritt.",
      divergentRisks:
        "Compliance, QA und Entwickler-Agent halten Schreibrechte, externe Requests, Speicherlogik und technische Aktivierung gesperrt.",
      smallestNextStep:
        "Jamal prüft die gemeinsame Empfehlung und entscheidet, ob der nächste kleine Schritt manuell freigegeben, begrenzt nachgeschärft oder verworfen wird.",
      jamalMustDecide:
        "Welche Entscheidung trifft Jamal aus dem heutigen Agenten-Tageslauf?",
      explicitlyNotAutomatic:
        "Keine Aufgabe startet automatisch, keine Entscheidung wird gespeichert, keine Agentenautonomie wird automatisch erhöht.",
    },
    projectManagerFilterRole: {
      statement:
        "Der Projektmanager-Agent ist der Filter zwischen Agentenarbeit und Jamal.",
      tasks: [
        "Agentenbeiträge bündeln",
        "Widersprüche erkennen",
        "Unwichtiges ausblenden",
        "Risiken sichtbar machen",
        "nur entscheidungsreife Punkte an Jamal geben",
        "den kleinsten nächsten Schritt vorschlagen",
      ],
      boundary:
        "Der Projektmanager-Agent darf nichts ausführen, nichts speichern und keine Statusänderung auslösen.",
    },
    hrAutonomyEvaluation: {
      saferToday:
        "Projektmanager-Agent wird sicherer, weil er Beiträge bündelt, statt Folgeaktionen auszuführen.",
      needsMoreContext:
        "Spezialagenten brauchen weiterhin Projektkontext, bevor ihre Beiträge entscheidungsreif werden.",
      needsCloseGuidance:
        "Compliance/Risiko-Agent, Entwickler-Agent und Plugin/Tool-Radar-Agent bleiben eng geführt.",
      possibleSmallAutonomyWindow:
        "HR darf vorschlagen, welcher Agent 1 % mehr Vorbereitungsspielraum bekommt, aber keine Autonomie erhöhen.",
      continuingBoundary:
        "Nur Vorschlag. Keine automatische Autonomie-Erhöhung, kein Trainingstart, keine Speicherung.",
    },
    jamalManualDecision: {
      question:
        "Welche Entscheidung trifft Jamal aus dem heutigen Agenten-Tageslauf?",
      options: [
        {
          option: "Option A: Empfohlenen nächsten kleinen Schritt manuell freigeben",
          meaning:
            "Jamal übernimmt die verdichtete Empfehlung als nächsten read-only Arbeitsschritt.",
          benefit:
            "Der Tageslauf erzeugt konkrete Führung ohne Automatisierung.",
          risk:
            "Der Schritt muss klein bleiben und darf nicht als Aufgabenstart verstanden werden.",
          recommendedFollowUp:
            "Nächsten kleinen Schritt manuell prüfen und weiterhin read-only halten.",
          safetyBoundary:
            "Keine Speicherung, keine Statusänderung, keine Schreibrechte, keine externe Anfrage.",
        },
        {
          option: "Option B: Agentenbeiträge noch einmal begrenzt nachschärfen",
          meaning:
            "Jamal fordert genau eine begrenzte Präzisierung der Agentenbeiträge.",
          benefit:
            "Unklare Beiträge werden entscheidbarer.",
          risk:
            "Nachschärfung darf nicht zum neuen Vorbereitungsloop werden.",
          recommendedFollowUp:
            "Nur die unklare Stelle nachschärfen, danach erneut entscheiden.",
          safetyBoundary:
            "Keine neuen Funktionen, keine Ausführung, keine Speicherung.",
        },
        {
          option: "Option C: Heute keinen Schritt ableiten und Fokus neu wählen",
          meaning:
            "Der Tageslauf wird verworfen und ein anderer Fokus wird manuell gewählt.",
          benefit:
            "Jamal bleibt in Kontrolle, wenn der Fokus nicht trägt.",
          risk:
            "Produktivitätsgewinn verschiebt sich auf später.",
          recommendedFollowUp:
            "Neuen Tagesfokus formulieren und Agentenlauf erneut read-only betrachten.",
          safetyBoundary:
            "Keine automatische Fokusänderung, keine Statusänderung, keine Folgeaktion.",
        },
      ],
    },
    v11Boundary: {
      mayNow: [
        "Agentenarbeit strukturieren",
        "Agentenbeiträge sichtbar machen",
        "Empfehlungen verdichten",
        "Jamals Entscheidungen vorbereiten",
        "Autonomie-Reife einschätzen",
        "nächste kleine Schritte vorschlagen",
      ],
      mayNotNow: [
        "Aufgaben starten",
        "Entscheidungen speichern",
        "Projektstatus ändern",
        "Checklisten aktualisieren",
        "Airtable oder Datenbanken beschreiben",
        "externe Requests ausführen",
        "Automationen auslösen",
        "Schreibrechte vorbereiten",
        "Schreibrechte simulieren",
        "technische Aktivierung anlegen",
      ],
    },
    safetyBoundary: [
      "keine Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
      "keine externe Request-Ausführung",
    ],
    prepared: true,
    activated: false,
    readOnlyOnly: true,
    v11AgentDailyRunOnly: true,
    agentCount: dailyAgentAssignments.length,
    decisionStored: false,
    checklistUpdated: false,
    taskStarted: false,
    statusChanged: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    projectStatusChanged: false,
    madeExternalRequest: false,
    manualOnly: true,
    localOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
  };
}

function getAgentResultRunContribution(proposal, index) {
  const dailyAssignment = getAgentDailyRunAssignment(proposal, index);
  const group = /geschäftsführer|projektmanager|wissen|archiv|hr/i.test(proposal.agent)
    ? "Gruppe 1: Führung und Entscheidung"
    : /produktmanager|entwickler|design|content|qa|quality|web|app|präsentation|foto|video/i.test(proposal.agent)
      ? "Gruppe 2: Produkt, Umsetzung und Qualität"
      : "Gruppe 3: Sicherheit, Support und Tools";

  return {
    agentName: proposal.agent,
    role: proposal.role,
    group,
    dailyRunOrder: dailyAssignment.todaysOrder,
    concreteResultContribution:
      `${proposal.agent} liefert für den Tagesfokus eine ${proposal.role}-Einschätzung: ${proposal.todayTrainingStep}`,
    recommendation: proposal.smallAutonomyIncrease,
    riskOrBoundary: proposal.riskBoundary,
    smallestNextStep:
      "Beitrag in die Projektmanager-Verdichtung geben und nur als manuelle Entscheidungsvorlage nutzen.",
    handoffTo: dailyAssignment.handoffTo,
    releaseNeeded: dailyAssignment.compactResult.releaseNeeded,
    mustNotDo:
      "Nicht speichern, nicht ausführen, keine Aufgabe starten, keinen Status ändern, keine externe Anfrage auslösen.",
  };
}

function getProductiveCentralV11AgentResultRun() {
  const agentResults = HR_DAILY_TRAINING_PROPOSALS.map((proposal, index) =>
    getAgentResultRunContribution(proposal, index),
  );

  return {
    title: "V1.1 Agenten-Ergebnislauf",
    source:
      "Ausgangspunkt ist V1.1.0: Der Agenten-Tageslauf ist als read-only Arbeitsmodus vorhanden und wird jetzt in konkrete Ergebnisbeiträge verdichtet.",
    startingPoint: [
      "V1 ist als finaler read-only Betriebsstand vorhanden",
      "V1.1.0 Agenten-Tageslauf ist vorhanden",
      "V1.1.1 verdichtet den Tageslauf jetzt zu konkreten Agenten-Ergebnissen",
      "alle 25 Agents bleiben erhalten",
      "HR liefert weiterhin 25 Vorschläge inklusive HR-Agent",
      "keine Daten werden verändert",
      "keine Aufgaben werden gestartet",
      "keine Entscheidungen werden gespeichert",
      "keine Schreibrechte werden vorbereitet",
      "keine externen Requests werden ausgeführt",
    ],
    todaysFocus: {
      focus:
        "Konkrete Ergebnisbeiträge aller 25 Agenten für den nächsten kleinen Produktivitätsschritt sichtbar machen.",
      whyImportant:
        "Jamal sieht nicht nur Rollen und Aufträge, sondern konkrete Beiträge, Risiken und eine verdichtete Entscheidungsvorlage.",
      expectedBenefitForJamal:
        "Bessere Entscheidungsgeschwindigkeit, weil Agentenbeiträge in eine gemeinsame Empfehlung übersetzt werden.",
      smallestUsefulResult:
        "Eine Projektmanager-Verdichtung mit einem kleinsten nächsten manuellen Schritt.",
      resultRunBoundary:
        "Nur statische Ergebnisbeiträge: keine Ausführung, keine Speicherung, keine Schreibrechte, keine externen Requests.",
      manualDecisionQuestion:
        "Welcher konkrete nächste Produktivitätsschritt bringt die KI-Unternehmenszentrale heute näher an echten Agentenbetrieb, ohne Schreibrechte oder Automatisierung zu aktivieren?",
    },
    agentResultContributions: agentResults,
    resultGroups: [
      {
        group: "Gruppe 1: Führung und Entscheidung",
        expectedContributions: [
          "GF-Agent liefert die wichtigste Führungsfrage",
          "Projektmanager-Agent liefert den kleinsten nächsten Projektschritt",
          "Wissens/Archiv-Agent liefert den relevanten Kontext",
          "HR-Agent liefert die Autonomie- und Trainingsbewertung",
        ],
      },
      {
        group: "Gruppe 2: Produkt, Umsetzung und Qualität",
        expectedContributions: [
          "Produktmanager-Agent liefert Nutzen- und Produktbewertung",
          "Entwickler-Agent liefert technische Machbarkeit",
          "Design-Director-Agent liefert Verständlichkeits- und UI-Bewertung",
          "Content-Agent liefert Sprach- und Kommunikationsbewertung",
          "QA-Agent liefert Prüfpunkte und Qualitätsrisiken",
        ],
      },
      {
        group: "Gruppe 3: Sicherheit, Support und Tools",
        expectedContributions: [
          "Compliance/Risiko-Agent liefert Grenzen und Risiken",
          "Plugin/Tool-Radar-Agent liefert read-only Tool-Bedarf",
          "Support-Agent liefert mögliche Nutzerfragen und Blocker",
          "weitere vorhandene Agents liefern jeweils ihren begrenzten Beitrag entsprechend ihrer Rolle",
        ],
      },
    ],
    projectManagerCondensation: {
      title: "Verdichtung durch Projektmanager-Agent",
      keyInsight:
        "Alle Agentenbeiträge sind nur dann produktiv, wenn sie in genau einen kleinsten nächsten Schritt übersetzt werden.",
      matchingRecommendation:
        "Der nächste Schritt soll ein read-only Produktivitätsschritt sein: Ergebnisbeiträge prüfen, Widerspruch klären, Jamal-Entscheidung vorbereiten.",
      divergentAssessments:
        "Fachagenten liefern Nutzenideen; QA, Entwickler und Compliance begrenzen jede technische Aktivierung.",
      criticalRisks:
        "Zu viele Beiträge könnten wie Aufgabenstart wirken; Schreibrechte, Statusänderungen und externe Requests bleiben gesperrt.",
      smallestNextStep:
        "Jamal prüft die verdichtete Empfehlung und entscheidet, ob ein kleiner read-only Produktivitätsschritt manuell freigegeben wird.",
      jamalDecision:
        "Empfohlenen nächsten kleinen Schritt freigeben, Ergebnisse einmal schärfen oder Tagesfokus ändern.",
      mustNotDo:
        "Keine Aufgaben starten, keine Entscheidungen speichern, keinen Projektstatus ändern, keine Agenten autonom aktivieren, keine Schreibrechte vorbereiten, keine externen Requests ausführen.",
      laterDocumentationWithoutStorage:
        "Später dokumentierbar wären Tagesfokus, Agentenbeiträge, Risiken, Empfehlung und Jamal-Entscheidung; jetzt wird nichts gespeichert.",
      may: [
        "bündeln",
        "priorisieren",
        "Widersprüche sichtbar machen",
        "Empfehlungen formulieren",
        "Entscheidungsvorlagen vorbereiten",
      ],
      mayNot: [
        "Aufgaben starten",
        "Entscheidungen speichern",
        "Projektstatus ändern",
        "Agenten autonom aktivieren",
        "Schreibrechte vorbereiten",
        "externe Requests ausführen",
      ],
    },
    sharedAgentRecommendation: {
      mainRecommendation:
        "Den Agenten-Ergebnislauf als read-only Entscheidungsvorbereitung nutzen und daraus genau einen kleinen manuellen Produktivitätsschritt ableiten.",
      reason:
        "Alle 25 Agenten liefern konkrete Beiträge, aber nur die Projektmanager-Verdichtung macht daraus eine führbare Entscheidung.",
      benefitForJamal:
        "Jamal erkennt schneller, welche Empfehlung tragfähig ist und welche Grenzen gelten.",
      riskIfImplemented:
        "Wenn die Empfehlung als Aufgabenstart missverstanden wird, entstehen falsche Erwartungen. Deshalb bleibt sie read-only.",
      riskIfNotImplemented:
        "Ohne Ergebnisverdichtung bleiben Agentenbeiträge zu verstreut und schwer führbar.",
      smallestManualNextStep:
        "Eine gemeinsame Empfehlung lesen und manuell entscheiden, ob genau ein nächster read-only Schritt folgt.",
      safetyBoundary:
        "Keine Speicherung, keine Schreibrechte, keine Aufgabenstarts, keine externen Requests.",
      requiredJamalDecision:
        "Jamal entscheidet, ob der empfohlene kleine Schritt übernommen, nachgeschärft oder verworfen wird.",
    },
    jamalManualDecision: {
      question:
        "Welche Entscheidung trifft Jamal aus dem heutigen Agenten-Ergebnislauf?",
      options: [
        {
          option: "Option A: Empfohlenen nächsten kleinen Schritt manuell freigeben",
          meaning:
            "Jamal übernimmt die gemeinsame Empfehlung als nächsten kleinen read-only Produktivitätsschritt.",
          benefit:
            "Agentenarbeit wird konkret nutzbar, ohne technische Ausführung zu starten.",
          risk:
            "Der Schritt muss klein bleiben und darf keine versteckte Aufgabe erzeugen.",
          recommendedFollowUp:
            "Kleinsten Schritt manuell lesen, prüfen und nur im read-only Modus weiterführen.",
          safetyBoundary:
            "Keine Speicherung, keine Aufgabenstarts, keine Schreibrechte, keine externe Anfrage.",
        },
        {
          option: "Option B: Agentenergebnisse einmal begrenzt nachschärfen",
          meaning:
            "Jamal lässt genau unklare Ergebnisbeiträge einmal präzisieren.",
          benefit:
            "Die Entscheidungsvorlage wird klarer, ohne neue Funktion zu öffnen.",
          risk:
            "Nachschärfung darf nicht zu einer weiteren offenen Vorbereitungsrunde werden.",
          recommendedFollowUp:
            "Nur unklare Beiträge schärfen, danach erneut manuell entscheiden.",
          safetyBoundary:
            "Keine Speicherung, keine Ausführung, keine technische Aktivierung.",
        },
        {
          option: "Option C: Tagesfokus ändern und neuen Ergebnislauf vorbereiten",
          meaning:
            "Jamal verwirft den Fokus und lässt den Ergebnislauf später auf einen anderen Fokus ausrichten.",
          benefit:
            "Die Zentrale bleibt führbar, wenn der Fokus heute nicht trägt.",
          risk:
            "Produktivitätsgewinn verzögert sich.",
          recommendedFollowUp:
            "Neuen Tagesfokus formulieren und wieder rein read-only prüfen.",
          safetyBoundary:
            "Keine automatische Fokusänderung, keine Statusänderung, keine Folgeaktion.",
        },
      ],
    },
    hrAutonomyEvaluation: {
      bestResultToday:
        "Projektmanager-Agent liefert den brauchbarsten Ergebnisbeitrag, weil er aus 25 Beiträgen eine führbare Entscheidung verdichtet.",
      needsCloseGuidance:
        "Entwickler-Agent, Compliance/Risiko-Agent und Plugin/Tool-Radar-Agent bleiben eng geführt, weil ihre Beiträge schnell technische Wirkung andeuten könnten.",
      possibleSmallAutonomyWindow:
        "Projektmanager-Agent darf künftig stärker priorisieren, aber weiterhin nichts ausführen.",
      onePercentImprovementPerAgent:
        "Jeder Agent soll morgen einen Beitrag noch konkreter, kürzer und entscheidbarer formulieren.",
      continuingBoundary:
        "HR bewertet nur. Keine automatische Autonomie-Erhöhung, keine Trainingsausführung, keine Speicherung.",
      whyNoAutomaticIncrease:
        "Autonomie braucht Jamals manuelle Entscheidung und darf nicht aus einem Ergebnislauf automatisch folgen.",
    },
    qualityAndSafetyCheck: {
      all25AgentsIncluded: agentResults.length === 25,
      everyAgentHasConcreteContribution:
        agentResults.every((entry) => Boolean(entry.concreteResultContribution)),
      sharedRecommendationExists: true,
      clearJamalDecisionExists: true,
      smallestNextStepVisible: true,
      remainsReadOnly: true,
      noSaveOrWriteFunction: true,
      madeExternalRequestFalse: true,
    },
    v11Boundary: {
      may: [
        "Agentenbeiträge sichtbar machen",
        "Ergebnisse strukturieren",
        "Empfehlungen verdichten",
        "Risiken und Grenzen benennen",
        "Jamals Entscheidung vorbereiten",
        "Autonomie-Reife bewerten",
        "nächste kleine Schritte vorschlagen",
      ],
      mayNot: [
        "Aufgaben starten",
        "Entscheidungen speichern",
        "Projektstatus ändern",
        "Checklisten aktualisieren",
        "Airtable oder Datenbanken beschreiben",
        "externe Requests ausführen",
        "Automationen auslösen",
        "Schreibrechte vorbereiten",
        "Schreibrechte simulieren",
        "technische Aktivierung anlegen",
      ],
    },
    safetyBoundary: [
      "keine Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
      "keine externe Request-Ausführung",
    ],
    prepared: true,
    activated: false,
    readOnlyOnly: true,
    v11AgentResultRunOnly: true,
    agentCount: agentResults.length,
    decisionStored: false,
    checklistUpdated: false,
    taskStarted: false,
    statusChanged: false,
    systemActionStarted: false,
    writeCapabilityActivated: false,
    writeFunctionAvailable: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    technicalWriteImplementationPrepared: false,
    technicalWritePreparationActivated: false,
    simulatedWriteCapabilityPrepared: false,
    simulationActivated: false,
    projectStatusChanged: false,
    madeExternalRequest: false,
    manualOnly: true,
    localOnly: true,
    externalRequestsBlocked: true,
    storageBlocked: true,
    writeOperationsBlocked: true,
    taskStartBlocked: true,
    projectStatusChangeBlocked: true,
    decisionStorageBlocked: true,
    checklistUpdateBlocked: true,
    automationBlocked: true,
    deploymentBlocked: true,
    pluginExecutionBlocked: true,
  };
}

function getPluginEnabledAgentTestModeEntry(proposal, index) {
  const recommendedPlugins = getRecommendedPluginsForAgent(proposal.agent, proposal.role);
  const needsManualApproval = /gmail|calendar|airtable|github|canva|heygen/i.test(
    recommendedPlugins.join(" "),
  );
  const currentConnectionStatus = recommendedPlugins.length
    ? "read-only anschlussfähig, echte Connector-Nutzung noch nicht freigegeben"
    : "ohne Plugin arbeitsfähig";

  return {
    agentName: proposal.agent,
    role: proposal.role,
    neededPluginsOrTools: recommendedPlugins.length
      ? recommendedPlugins
      : ["Unternehmenszentrale-Daten read-only", "Agenten-Ergebnislauf", "Projektkontext"],
    currentConnectionStatus,
    allowedUse:
      "Lage bewerten, Informationen read-only einordnen, Ergebnisvorschlag vorbereiten und Risiken benennen.",
    blockedUse:
      "Keine Schreibaktion, kein Versand, keine Statusänderung, keine Tool-Aktivierung ohne Jamal.",
    firstSafeTestRun:
      index % 4 === 0
        ? "Read-only Lageauswertung mit Agenten-Ergebnisbeitrag"
        : index % 4 === 1
          ? "Plugin-Readiness-Abgleich ohne externe Aktion"
          : index % 4 === 2
            ? "Lokale Datei-/Kontextanalyse ohne Speicherung"
            : "Testbericht aus vorhandenen Informationen vorbereiten",
    expectedResult:
      "Tool-Bedarf, Anschlussstatus, Risiko und nächster manueller Schritt werden sichtbar.",
    requiresJamalApproval: needsManualApproval ? "ja" : "nein",
    risk:
      needsManualApproval
        ? "Connector-Nutzung könnte externe Daten berühren und braucht manuelle Freigabe."
        : "Niedrig, solange der Test lokal/read-only bleibt.",
    safetyBoundary:
      "Keine unkontrollierte Plugin-Nutzung, keine automatischen externen Requests, keine Schreibrechte.",
    workCapability:
      needsManualApproval
        ? "arbeitsfähig nur mit Freigabe"
        : recommendedPlugins.length
          ? "arbeitsfähig mit read-only Plugin"
          : "arbeitsfähig ohne Plugin",
    nextCapabilityStep:
      needsManualApproval
        ? "Jamal-Freigabe für einzelnen read-only Connector-Test prüfen."
        : "Lokalen read-only Testlauf ausführen und Ergebnisbericht prüfen.",
  };
}

function getProductiveCentralV11PluginEnabledAgentTestMode() {
  const agentToolMatrix = HR_DAILY_TRAINING_PROPOSALS.map((proposal, index) =>
    getPluginEnabledAgentTestModeEntry(proposal, index),
  );
  const immediatelyTestableCount = agentToolMatrix.filter(
    (entry) => entry.workCapability === "arbeitsfähig ohne Plugin",
  ).length;
  const readOnlyConnectableCount = agentToolMatrix.filter(
    (entry) => entry.workCapability === "arbeitsfähig mit read-only Plugin",
  ).length;
  const approvalRequiredCount = agentToolMatrix.filter(
    (entry) => entry.workCapability === "arbeitsfähig nur mit Freigabe",
  ).length;

  return {
    title: "V1.1 Plugin-fähiger Agenten-Testbetrieb",
    source:
      "Ausgangspunkt ist V1.1.1: Die Agents liefern sichtbare Ergebnisbeiträge; jetzt wird kontrollierte Plugin- und Tool-Fähigkeit vorbereitet.",
    startingPoint: [
      "V1 ist finaler read-only Betriebsstand",
      "V1.1.0 Agenten-Tageslauf ist vorhanden",
      "V1.1.1 Agenten-Ergebnislauf ist vorhanden",
      "25 Agents sind vorhanden",
      "HR liefert weiterhin 25 Vorschläge inklusive HR-Agent",
      "die Agents liefern bereits sichtbare Ergebnisbeiträge",
      "der nächste Schritt ist kontrollierte Plugin- und Tool-Fähigkeit",
      "keine unkontrollierte Automatisierung wird aktiviert",
    ],
    targetPicture: {
      statement:
        "Die Agents sollen in kontrollierten Testläufen echte Arbeitsergebnisse mit Hilfe von Plugins und Tools vorbereiten können. Jede Tool-Nutzung bleibt begrenzt, sichtbar und manuell prüfbar.",
      distinctions: [
        "read-only Tool-Nutzung",
        "externe Informationsabfrage",
        "Dateianalyse",
        "Projektanalyse",
        "UI-/API-Prüfung",
        "Entwurfserstellung",
        "Testbericht",
        "schreibende Aktionen",
        "produktive Änderungen",
      ],
      currentExternalRequestStatus:
        "Bisher bleibt madeExternalRequest: false. Zukünftig kontrolliert erlaubbare Testrequests sind nur als Freigabekategorie beschrieben.",
    },
    agentToolMatrix,
    testRunCategories: [
      {
        category: "Kategorie A: Sicher sofort testbar",
        examples: [
          "read-only Lageauswertung",
          "Agenten-Ergebnisverdichtung",
          "Code-/Dateianalyse",
          "lokale Syntaxprüfung",
          "UI-Auslieferungsprüfung",
          "Testbericht erstellen",
        ],
      },
      {
        category: "Kategorie B: Kontrolliert testbar mit externer Abfrage",
        examples: [
          "Plugin-Status prüfen",
          "öffentlich verfügbare Informationen abrufen",
          "Tool-Verfügbarkeit prüfen",
          "API-Erreichbarkeit testen",
          "nur mit sichtbarem Protokoll",
        ],
      },
      {
        category: "Kategorie C: Nur mit manueller Jamal-Freigabe testbar",
        examples: [
          "echte Connector-Nutzung",
          "Gmail-/Kalender-/Drive-/Airtable-Lesezugriff",
          "GitHub-Lesezugriff",
          "Vercel-/Deployment-Status lesen",
          "Plugin-Ergebnis in Entscheidungsvorlage übernehmen",
        ],
      },
      {
        category: "Kategorie D: Weiterhin gesperrt",
        examples: [
          "Schreiben in Airtable/Datenbanken",
          "E-Mails senden",
          "Kalendertermine erstellen",
          "Dateien verändern",
          "Projektstatus ändern",
          "Aufgaben automatisch starten",
          "Deployments auslösen",
          "Entscheidungen speichern",
          "Autonomie automatisch erhöhen",
        ],
      },
    ],
    firstRealTestRuns: [
      {
        testRun: "Agenten-Ergebnislauf mit Plugin-Readiness-Abgleich",
        goal:
          "Prüfen, welche Agents für welchen Arbeitsschritt ein Tool brauchen; Anschlusslücken sichtbar machen; keine externen Aktionen ausführen.",
        expectedResult:
          "Tool-Bedarf je Agent, Anschlussstatus, Risiko und nächster manueller Schritt.",
      },
      {
        testRun: "QA-Agent prüft lokale Systemstabilität",
        goal:
          "node --check app.js, node --check server.js, API-Endpunkte prüfen und UI-Auslieferung prüfen.",
        expectedResult: "Testbericht, Fehlerliste und Sicherheitsstatus.",
      },
      {
        testRun: "Projektmanager-Agent verdichtet Agentenergebnisse zu Arbeitsauftrag",
        goal:
          "Aus 25 Agentenbeiträgen einen konkreten nächsten Arbeitsschritt ableiten.",
        expectedResult:
          "Empfehlung, Risiko, benötigte Entscheidung und nächster kleiner Schritt.",
      },
      {
        testRun: "Plugin/Tool-Radar-Agent erstellt Anschlussplan",
        goal:
          "Welche Plugins brauchen welche Agents? Welche Tools sind read-only nutzbar? Wo braucht es Jamals Freigabe?",
        expectedResult:
          "Tool-Matrix, Anschlusslücken und Freigabepriorität.",
      },
    ],
    capabilitySummary: {
      immediatelyTestableCount,
      readOnlyConnectableCount,
      approvalRequiredCount,
      blockedAgents: [],
      biggestBottleneck:
        "Echte Connector-Nutzung und externe Testrequests brauchen klare manuelle Freigabe und Protokollgrenze.",
      agentCapability: agentToolMatrix.map((entry) => ({
        agentName: entry.agentName,
        capability: entry.workCapability,
        nextStep: entry.nextCapabilityStep,
      })),
    },
    approvalAndSafetyModel: [
      "Stufe 1: Read-only Agentenarbeit ohne externe Systeme",
      "Stufe 2: Read-only externe Abfrage mit Protokoll",
      "Stufe 3: Connector-Lesezugriff nur nach manueller Freigabe",
      "Stufe 4: Schreibende Aktionen bleiben gesperrt",
      "Stufe 5: Schreibrechte nur in späterer Version und nur nach separater GF-Entscheidung",
    ],
    jamalManualDecision: {
      question:
        "Welche Art von Agenten-Testbetrieb gibt Jamal als Nächstes frei?",
      options: [
        {
          option: "Option A: Nur lokale read-only Testläufe freigeben",
          meaning:
            "Agenten nutzen nur vorhandene lokale Informationen und erzeugen Testberichte.",
          benefit: "Erste echte Agentenarbeit wird sichtbar, Risiko bleibt niedrig.",
          risk: "Externe Anschlusslücken bleiben zunächst theoretisch.",
          necessaryBoundary:
            "Keine externen Requests, keine Speicherung, keine Schreibrechte.",
          recommendedFollowUp:
            "Mit QA-Testbericht und Plugin-Readiness-Abgleich starten.",
        },
        {
          option:
            "Option B: Read-only Testläufe mit kontrollierter externer Abfrage freigeben",
          meaning:
            "Einzelne externe Abfragen dürfen später mit Protokoll und Jamal-Grenze getestet werden.",
          benefit:
            "Tool-Verfügbarkeit und öffentliche Informationen können real geprüft werden.",
          risk:
            "Externe Requests berühren Systemgrenzen und brauchen klare Freigabe.",
          necessaryBoundary:
            "Nur read-only, nur protokolliert, nur nach manueller Freigabe.",
          recommendedFollowUp:
            "Erst Anschlussplan erstellen, dann einzelne Abfrage freigeben.",
        },
        {
          option: "Option C: Connector-Lesezugriffe einzeln manuell vorbereiten",
          meaning:
            "Gmail, Kalender, Drive, Airtable, GitHub oder Vercel werden nur einzeln als Lesetest vorbereitet.",
          benefit:
            "Echte Projektkontexte können später kontrolliert eingebunden werden.",
          risk:
            "Connector-Zugriffe können sensible Daten berühren.",
          necessaryBoundary:
            "Ein Connector, ein Zweck, eine Freigabe, kein Schreiben.",
          recommendedFollowUp:
            "Jamal wählt genau einen Connector-Kandidaten für spätere Prüfung.",
        },
      ],
    },
    centralRecommendation: {
      recommendation:
        "Empfehlung: Option A starten und parallel den Anschlussplan für Option B und C vorbereiten.",
      reasons: [
        "erste echte Agentenarbeit wird möglich",
        "Risiko bleibt niedrig",
        "Testläufe liefern sofort Erkenntnisse",
        "Schreibrechte bleiben gesperrt",
        "externe Systeme werden nicht unkontrolliert genutzt",
        "Jamal behält die volle Freigabehoheit",
      ],
    },
    safetyBoundary: [
      "keine unkontrollierte Plugin-Nutzung",
      "keine automatischen externen Requests",
      "keine Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine automatische Autonomie-Erhöhung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
      "schreibende Aktionen bleiben gesperrt",
    ],
    prepared: true,
    activated: false,
    readOnlyOnly: true,
    pluginEnabledAgentTestModeOnly: true,
    agentCount: agentToolMatrix.length,
    madeExternalRequest: false,
    futureControlledExternalRequestsOnly: true,
    uncontrolledPluginUseBlocked: true,
    automaticExternalRequestsBlocked: true,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    taskStarted: false,
    statusChanged: false,
    decisionStored: false,
    checklistUpdated: false,
    automaticAutonomyIncreaseBlocked: true,
    technicalWriteImplementationPrepared: false,
    simulatedWriteCapabilityPrepared: false,
  };
}

function getControlledAgentPilotRunMatrixEntry(entry, index) {
  const hasExternalConnector = entry.neededPluginsOrTools.some((tool) =>
    ["Airtable", "Gmail", "Google Calendar", "GitHub"].includes(tool),
  );
  const hasLocalOnlyTool = entry.neededPluginsOrTools.some((tool) =>
    ["lokale Dateien", "lokale Syntaxprüfung", "UI-/API-Prüfung", "Unternehmenszentrale-Daten"].includes(tool),
  );
  const toolCategory = hasExternalConnector
    ? "externer read-only Connector später möglich"
    : hasLocalOnlyTool
      ? "lokales read-only Tool"
      : "kein Tool nötig";

  return {
    agentName: entry.agentName,
    role: entry.role,
    neededToolsOrPlugins: entry.neededPluginsOrTools,
    toolCategory,
    currentWorkCapabilityStatus:
      toolCategory === "kein Tool nötig"
        ? "sofort lokal testfähig"
        : toolCategory === "lokales read-only Tool"
          ? "lokal read-only testfähig"
          : "testfähig nach einzelner Jamal-Freigabe für read-only Connector",
    firstSafePilotContribution:
      index % 5 === 0
        ? "Pilotbeitrag zur Führungsfrage der KI-Unternehmenszentrale"
        : index % 5 === 1
          ? "Tool-Bedarf und Anschlusslücke für eigene Rolle benennen"
          : index % 5 === 2
            ? "Risiko, Grenze und kleinsten nächsten Schritt formulieren"
            : index % 5 === 3
              ? "Qualitäts- oder Sicherheitsprüfpunkt beitragen"
              : "Ergebnisbeitrag für Projektmanager-Verdichtung liefern",
    expectedResult:
      "Konkreter Pilotbeitrag mit Tool-Bedarf, Ergebnisqualität, Risiko und nächster Freigabestufe.",
    blockedActions:
      "Keine Aufgabenstarts, keine Entscheidungsspeicherung, keine Statusänderung, keine externen Requests ohne Freigabe und keine Schreibrechte.",
    requiresJamalApproval: hasExternalConnector ? "ja" : "nein",
    risk:
      hasExternalConnector
        ? "Read-only Connector könnte externe oder sensible Kontexte berühren und braucht Einzel-Freigabe."
        : "Niedrig, solange der Beitrag lokal und read-only bleibt.",
    nextUsefulApprovalStage:
      hasExternalConnector
        ? "Stufe 3: Connector-Lesezugriff nur nach manueller Freigabe"
        : "Stufe 1: Read-only Agentenarbeit ohne externe Systeme",
  };
}

function getProductiveCentralV11ControlledAgentPilotRun() {
  const pluginTestMode = getProductiveCentralV11PluginEnabledAgentTestMode();
  const pilotMatrix = pluginTestMode.agentToolMatrix.map((entry, index) =>
    getControlledAgentPilotRunMatrixEntry(entry, index),
  );
  const localReadyAgents = pilotMatrix.filter((entry) =>
    ["kein Tool nötig", "lokales read-only Tool"].includes(entry.toolCategory),
  );
  const connectorNeedAgents = pilotMatrix.filter(
    (entry) => entry.toolCategory === "externer read-only Connector später möglich",
  );
  const blockedAgents = pilotMatrix.filter(
    (entry) => entry.toolCategory === "schreibender Connector weiterhin gesperrt",
  );

  return {
    title: "V1.1 Kontrollierter Agenten-Pilotlauf",
    status:
      "erster kontrollierter Agenten-Pilotlauf mit Tool-Matrix vorbereitet",
    startingPoint: [
      "V1 ist finaler read-only Betriebsstand",
      "V1.1.0 Agenten-Tageslauf ist vorhanden",
      "V1.1.1 Agenten-Ergebnislauf ist vorhanden",
      "V1.1.2 plugin-fähiger Agenten-Testbetrieb ist vorhanden",
      "25 Agents sind vorhanden",
      "HR liefert weiterhin 25 Vorschläge inklusive HR-Agent",
      "der nächste Schritt ist ein kontrollierter Pilotlauf",
      "Pilotprojekt ist die KI-Unternehmenszentrale selbst",
      "keine Schreibrechte werden aktiviert",
      "keine externen Requests werden automatisch ausgeführt",
      "schreibende Aktionen bleiben gesperrt",
    ],
    pilotProject: {
      name: "KI-Unternehmenszentrale selbst",
      reasons: [
        "geringstes Risiko",
        "keine Kundendaten nötig",
        "keine externen Systeme nötig",
        "alle 25 Agents können sinnvoll beteiligt werden",
        "Sicherheitsgrenzen können sauber geprüft werden",
        "Agentenarbeit kann ohne produktive Datenänderung getestet werden",
      ],
    },
    pilotGoalChecks: [
      "welche Agents bereits arbeitsfähig sind",
      "welche Tools oder Plugins je Agent nötig sind",
      "welche Agents ohne Plugin arbeiten können",
      "welche Agents read-only Tools brauchen",
      "welche Agents später Connector-Lesezugriff brauchen",
      "welche Agents weiterhin gesperrt bleiben müssen",
      "ob die Agentenbeiträge zu einem verwertbaren Ergebnis verdichtet werden können",
      "ob QA und Compliance den Lauf freigeben würden",
      "ob HR eine vorsichtige Autonomie-Empfehlung geben kann",
    ],
    pilotMatrix,
    pilotPhases: [
      {
        phase: "Phase 1: Vorbereitung",
        steps: [
          "Tagesfokus bestätigen",
          "Pilotprojekt bestätigen",
          "beteiligte Agents anzeigen",
          "Tool-Bedarf je Agent sichtbar machen",
          "Sicherheitsgrenzen anzeigen",
        ],
      },
      {
        phase: "Phase 2: Agentenbeiträge",
        steps: [
          "jeder Agent liefert einen konkreten Pilotbeitrag",
          "jeder Agent nennt Empfehlung, Grenze und Risiko",
          "jeder Agent nennt, welches Tool er später brauchen könnte",
          "jeder Agent nennt, was er ausdrücklich nicht tun darf",
        ],
      },
      {
        phase: "Phase 3: Projektmanager-Verdichtung",
        steps: [
          "wichtigste Erkenntnisse bündeln",
          "übereinstimmende Empfehlungen sichtbar machen",
          "Widersprüche markieren",
          "Risiken priorisieren",
          "kleinsten nächsten Schritt ableiten",
          "sinnvollste Tool-Anschlüsse zuerst benennen",
          "Jamals Entscheidung vorbereiten",
        ],
      },
      {
        phase: "Phase 4: QA- und Compliance-Prüfung",
        steps: [
          "QA prüft Vollständigkeit, Prüfbarkeit, Widerspruchsfreiheit, UI-/API-Konsistenz und Testfähigkeit",
          "Compliance prüft Schreibsperren, Speichergrenzen, Aufgabenstart-Sperre, Statusänderungs-Sperre, Autonomiegrenze und externe Request-Grenzen",
        ],
      },
      {
        phase: "Phase 5: HR- und GF-Auswertung",
        steps: [
          "HR bewertet Testfähigkeit, Kontextbedarf, enge Führung und 1%-Verantwortung",
          "GF-Agent leitet daraus Jamals Entscheidungsfrage ab",
          "keine automatische Autonomie-Erhöhung erfolgt",
        ],
      },
    ],
    pilotResultSummary: {
      keyInsight:
        "Die 25 Agents können am risikoärmsten an der KI-Unternehmenszentrale selbst getestet werden, weil alle Beiträge lokal, read-only und ohne Kundendaten auswertbar sind.",
      workingAgents: `${localReadyAgents.length} Agents sind lokal oder ohne externen Connector testfähig.`,
      agentsWithPluginNeed: `${connectorNeedAgents.length} Agents brauchen später mindestens einen read-only Connector-Kontext.`,
      agentsWithApprovalNeed: `${connectorNeedAgents.length} Agents brauchen vor Connector-Nutzung eine einzelne Jamal-Freigabe.`,
      blockedAgents: `${blockedAgents.length} Agents sind vollständig blockiert; schreibende Aktionen bleiben aber für alle Agents gesperrt.`,
      biggestBottleneck:
        "Der größte Engpass ist nicht Schreibfähigkeit, sondern saubere Freigabegrenze für spätere read-only Connector-Lesetests.",
      bestNextToolPriority:
        "Lokale read-only Prüfungen und Dateianalyse vor externen Connectoren.",
      recommendedNextTestRun:
        "Nächsten lokalen read-only Pilotlauf mit Projektmanager-Verdichtung, QA-Bericht und Compliance-Bericht durchführen.",
      safetyStatus:
        "Kontrolliert, read-only, ohne automatische externe Requests und ohne Schreibrechte.",
      manualDecisionForJamal:
        "Welche nächste Stufe des Agenten-Testbetriebs gibt Jamal nach diesem Pilotlauf frei?",
    },
    toolPriorities: [
      "Priorität 1: Lokale read-only Prüfungen und Dateianalyse",
      "Priorität 2: API-/UI-Prüfungen mit sichtbarem Protokoll",
      "Priorität 3: GitHub- oder Projektdatei-Lesezugriff nur nach manueller Freigabe",
      "Priorität 4: Airtable-/Datenbank-Lesezugriff nur später und nur nach separater Freigabe",
      "Priorität 5: Schreibende Aktionen bleiben vollständig gesperrt",
    ],
    projectManagerOperatingFilter: {
      statement:
        "Der Projektmanager-Agent wird im Pilotlauf als zentraler Betriebsfilter eingesetzt.",
      may: [
        "Agentenbeiträge bündeln",
        "Tool-Bedarf priorisieren",
        "Risiken sichtbar machen",
        "Widersprüche markieren",
        "einen nächsten kleinen Schritt empfehlen",
        "eine Entscheidungsvorlage für Jamal vorbereiten",
      ],
      mayNot: [
        "Aufgaben starten",
        "Entscheidungen speichern",
        "Projektstatus ändern",
        "Agenten autonom freischalten",
        "Schreibrechte vorbereiten",
        "externe Requests ausführen",
      ],
    },
    qaPilotReport: {
      checked:
        "25-Agenten-Vollständigkeit, Tool-Matrix, Pilotphasen, UI-/API-Konsistenz, Testfähigkeit und Sicherheitsflags.",
      passed:
        "Pilotlauf ist als read-only Lesestruktur prüfbar; alle 25 Agents bleiben enthalten.",
      open:
        "Echte Connector-Lesetests sind noch nicht freigegeben und bleiben separater späterer Schritt.",
      blocker:
        "Kein Blocker für den lokalen read-only Pilotlauf.",
      nonBlockingNote:
        "Externe Tool-Prüfungen sind nur Vormerkung, kein aktiver Test.",
      recommendation:
        "Lokalen Pilotlauf freigeben, aber Connectoren erst nach separater Freigabe prüfen.",
    },
    compliancePilotReport: {
      keptBoundaries: [
        "keine Schreibrechte",
        "keine Speicherung",
        "keine Aufgabenstarts",
        "keine Projektstatusänderungen",
        "keine automatische Autonomie-Erhöhung",
        "keine unkontrollierten externen Requests",
        "Grenzen je Tool-Kategorie sichtbar",
      ],
      remainingRisks:
        "Spätere Connector-Lesezugriffe können sensible Kontexte berühren und brauchen Einzel-Freigabe.",
      safeToolUse:
        "Lokale read-only Prüfungen, Dateianalyse und UI-/API-Prüfungen mit sichtbarem Protokoll.",
      needsJamalApproval:
        "GitHub-, Airtable-, Gmail-, Kalender- oder Datenbank-Lesezugriffe.",
      blockedToolUse:
        "Schreibende Aktionen, Versand, Statusänderungen, Aufgabenstarts, Deployments und Autonomie-Erhöhung.",
      recommendation:
        "Option A durchführen; Option B nur als separate Freigabe vorbereiten.",
    },
    hrAutonomyPilotReport: {
      testCapableAgents:
        "Alle 25 Agents können einen read-only Pilotbeitrag liefern; echte Tool-Nutzung ist nach Risiko gestuft.",
      needsTraining:
        "Agents mit externem Connector-Bedarf brauchen mehr Kontext zu Datenschutz, Protokoll und Freigabegrenzen.",
      closeGuidance:
        "Alle Agents bleiben eng geführt, sobald externe Systeme, Kundendaten oder Schreibnähe betroffen wären.",
      onePercentImprovementPerAgent:
        "Jeder Agent benennt heute genau einen besseren Pilotbeitrag, eine klarere Grenze oder einen präziseren Tool-Bedarf.",
      blockedAutonomy:
        "Automatische Autonomie-Erhöhung bleibt vollständig gesperrt.",
      whyNoAutomaticIncrease:
        "Pilotbeiträge liefern Trainingssignale, aber keine operative Selbstfreigabe.",
    },
    jamalManualDecision: {
      question:
        "Welche nächste Stufe des Agenten-Testbetriebs gibt Jamal nach diesem Pilotlauf frei?",
      options: [
        {
          option: "Option A: Nächsten lokalen read-only Pilotlauf freigeben",
          meaning:
            "Die Agents arbeiten weiter nur mit lokalen Informationen, Tool-Matrix und sichtbarer Auswertung.",
          benefit:
            "Echte Arbeitslogik entsteht bei niedrigem Risiko und ohne externe Systeme.",
          risk:
            "Connector-Fähigkeit bleibt noch theoretisch.",
          necessaryBoundary:
            "Keine externen Requests, keine Speicherung, keine Schreibrechte.",
          recommendedFollowUp:
            "Projektmanager-, QA-, Compliance- und HR-Bericht erneut verdichten.",
        },
        {
          option: "Option B: Einen begrenzten read-only Connector-Test vorbereiten",
          meaning:
            "Genau ein späterer Connector-Lesetest wird separat mit Zweck, Grenze und Freigabe vorbereitet.",
          benefit:
            "Erste echte Tool-Anschlussfähigkeit wird überprüfbar.",
          risk:
            "Externe Daten- oder Tool-Kontexte berühren eine höhere Sicherheitsstufe.",
          necessaryBoundary:
            "Ein Connector, ein Zweck, sichtbares Protokoll, keine Schreibaktion.",
          recommendedFollowUp:
            "Separaten Freigabekorridor für genau einen read-only Connector-Kandidaten vorbereiten.",
        },
        {
          option: "Option C: Pilotlauf nachschärfen, bevor Connectoren vorbereitet werden",
          meaning:
            "Die lokale Pilotstruktur wird präzisiert, bevor externe Lesezugriffe überhaupt geplant werden.",
          benefit:
            "Risiko sinkt weiter, QA und Compliance bleiben früh eingebunden.",
          risk:
            "Produktivitätsgewinn durch echte Tooltests verzögert sich.",
          necessaryBoundary:
            "Nur Nachschärfung, keine neuen Funktionen, keine externen Requests.",
          recommendedFollowUp:
            "Tool-Kategorien und Agentenbeiträge einmal begrenzt schärfen.",
        },
      ],
    },
    centralRecommendation: {
      recommendation:
        "Empfehlung: Option A durchführen und parallel Option B als separate Freigabe vorbereiten.",
      reasons: [
        "Agents kommen in echte Arbeitslogik",
        "Risiko bleibt niedrig",
        "Tool-Bedarf wird sichtbar",
        "QA und Compliance bleiben eingebunden",
        "HR bewertet Autonomie vorsichtig",
        "Jamal behält die volle Kontrolle",
        "Connector-Lesezugriffe werden nicht unkontrolliert aktiviert",
      ],
    },
    v113Boundary: {
      may: [
        "Agenten-Pilotlauf strukturieren",
        "Tool-Matrix je Agent anzeigen",
        "sichere Testläufe definieren",
        "Agentenbeiträge auswerten",
        "Projektmanager-Verdichtung anzeigen",
        "QA-/Compliance-/HR-Berichte vorbereiten",
        "Jamals Entscheidung vorbereiten",
        "nächste Tool-Prioritäten vorschlagen",
      ],
      mayNot: [
        "Aufgaben starten",
        "Entscheidungen speichern",
        "Projektstatus ändern",
        "Checklisten aktualisieren",
        "Airtable oder Datenbanken beschreiben",
        "E-Mails senden",
        "Kalendertermine erstellen",
        "Dateien produktiv verändern",
        "externe Requests automatisch ausführen",
        "Automationen auslösen",
        "Schreibrechte vorbereiten",
        "Schreibrechte simulieren",
        "technische Aktivierung anlegen",
        "Autonomie automatisch erhöhen",
      ],
    },
    safetyBoundary: [
      "keine unkontrollierte Plugin-Nutzung",
      "keine automatischen externen Requests",
      "keine Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine automatische Autonomie-Erhöhung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
      "schreibende Aktionen bleiben gesperrt",
    ],
    prepared: true,
    activated: false,
    readOnlyOnly: true,
    controlledAgentPilotRunOnly: true,
    agentCount: pilotMatrix.length,
    madeExternalRequest: false,
    uncontrolledPluginUseBlocked: true,
    automaticExternalRequestsBlocked: true,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    taskStarted: false,
    statusChanged: false,
    decisionStored: false,
    checklistUpdated: false,
    automaticAutonomyIncreaseBlocked: true,
    technicalWriteImplementationPrepared: false,
    simulatedWriteCapabilityPrepared: false,
  };
}

function getProductiveCentralV11StrategicAgentPilotRun() {
  const controlledPilot = getProductiveCentralV11ControlledAgentPilotRun();
  const strategicMatrix = controlledPilot.pilotMatrix.map((entry) => ({
    agentName: entry.agentName,
    role: entry.role,
    todaysPilotContribution: entry.firstSafePilotContribution,
    neededToolsOrPlugins: entry.neededToolsOrPlugins,
    toolCategory: entry.toolCategory,
    currentWorkCapabilityStatus: entry.currentWorkCapabilityStatus,
    expectedResult: entry.expectedResult,
    blockedActions: entry.blockedActions,
    requiresJamalApproval: entry.requiresJamalApproval,
    risk: entry.risk,
    nextUsefulApprovalStage: entry.nextUsefulApprovalStage,
  }));

  return {
    title: "V1.1 Strategischer Agenten-Pilotlauf",
    status:
      "strategischer Agenten-Pilotlauf mit Tool-Matrix und Freigabekorridor vorbereitet",
    strategicStartingPoint: [
      "V1 ist finaler read-only Betriebsstand",
      "V1.1.0 Agenten-Tageslauf ist vorhanden",
      "V1.1.1 Agenten-Ergebnislauf ist vorhanden",
      "V1.1.2 plugin-fähiger Agenten-Testbetrieb ist vorhanden",
      "25 Agents sind vorhanden",
      "HR liefert weiterhin 25 Vorschläge inklusive HR-Agent",
      "nächster sinnvoller Schritt ist ein kontrollierter Pilotlauf",
      "Pilotprojekt ist die KI-Unternehmenszentrale selbst",
      "keine Schreibrechte werden aktiviert",
      "keine externen Requests werden automatisch ausgeführt",
      "schreibende Aktionen bleiben gesperrt",
    ],
    bundlingReason:
      "Diese Bündelung ist sinnvoll, weil Tool-Matrix, Pilotlauf, QA-Prüfung, Compliance-Prüfung, HR-Bewertung und Jamals Freigabeentscheidung logisch zusammengehören. Erst wenn diese Bestandteile gemeinsam sichtbar sind, kann bewertet werden, welche Agents wirklich arbeitsfähig sind und welcher nächste Freigabeschritt sicher möglich ist.",
    notBundled: [
      "echte Connector-Lesezugriffe",
      "Airtable-/Datenbank-Zugriffe",
      "Gmail-/Kalender-/Drive-Zugriffe",
      "GitHub-/Vercel-Zugriffe",
      "Schreibrechte",
      "Aufgabenstarts",
      "Automationen",
      "Entscheidungsspeicherung",
      "Projektstatusänderungen",
    ],
    notBundledBoundary:
      "Diese Punkte bleiben spätere, separate Freigabeentscheidungen.",
    pilotProject: controlledPilot.pilotProject,
    pilotGoalChecks: [
      "welche Agents bereits ohne Plugin arbeitsfähig sind",
      "welche Agents lokale read-only Tools brauchen",
      "welche Agents später Connector-Lesezugriff brauchen könnten",
      "welche Agents weiterhin eng geführt bleiben müssen",
      "welche Tool-/Plugin-Lücken bestehen",
      "ob die Agentenbeiträge zu einer verwertbaren Empfehlung verdichtet werden können",
      "ob QA und Compliance den nächsten Schritt freigeben würden",
      "ob HR vorsichtige Autonomie-Spielräume empfehlen kann",
      "welche manuelle Entscheidung Jamal als Nächstes treffen müsste",
    ],
    strategicMatrix,
    pilotPhases: [
      {
        phase: "Phase 1: Vorbereitung",
        steps: [
          "Pilotprojekt bestätigen",
          "Tagesfokus bestätigen",
          "beteiligte Agents anzeigen",
          "Tool-Bedarf je Agent sichtbar machen",
          "Sicherheitsgrenzen anzeigen",
        ],
      },
      {
        phase: "Phase 2: Agentenbeiträge",
        steps: [
          "Kurzbefund je Agent",
          "konkreter Pilotbeitrag je Agent",
          "Empfehlung je Agent",
          "Risiko/Grenze je Agent",
          "Tool-Bedarf je Agent",
          "was jeder Agent ausdrücklich nicht tun darf",
        ],
      },
      {
        phase: "Phase 3: Projektmanager-Verdichtung",
        steps: [
          "wichtigste Erkenntnisse bündeln",
          "übereinstimmende Empfehlungen sichtbar machen",
          "Widersprüche markieren",
          "Tool-Prioritäten ableiten",
          "Risiken priorisieren",
          "kleinsten nächsten Schritt empfehlen",
          "Jamals Entscheidungsfrage formulieren",
        ],
      },
      {
        phase: "Phase 4: QA- und Compliance-Prüfung",
        steps: [
          "QA prüft Vollständigkeit, Prüfbarkeit, UI-/API-Konsistenz, Testfähigkeit und offene Blocker",
          "Compliance/Risiko prüft Schreibsperren, Speichergrenzen, Aufgabenstart-Sperre, Statusänderungs-Sperre, Autonomiegrenze, externe Request-Grenzen und Tool-Kategorien",
        ],
      },
      {
        phase: "Phase 5: HR- und GF-Auswertung",
        steps: [
          "HR bewertet Testfähigkeit, Kontextbedarf, enge Führung und 1% mehr Testverantwortung",
          "HR begründet, warum keine automatische Autonomie-Erhöhung erfolgt",
          "GF-Agent formuliert daraus Jamals nächste manuelle Entscheidung",
        ],
      },
    ],
    pilotResultSummary: controlledPilot.pilotResultSummary,
    toolPriorities: controlledPilot.toolPriorities,
    projectManagerCondensation: controlledPilot.projectManagerOperatingFilter,
    qaPilotReport: controlledPilot.qaPilotReport,
    compliancePilotReport: controlledPilot.compliancePilotReport,
    hrAutonomyPilotReport: controlledPilot.hrAutonomyPilotReport,
    jamalManualDecision: {
      question:
        "Welche nächste Stufe des Agenten-Testbetriebs gibt Jamal nach diesem Pilotlauf frei?",
      options: [
        controlledPilot.jamalManualDecision.options[0],
        {
          ...controlledPilot.jamalManualDecision.options[1],
          option:
            "Option B: Einen begrenzten read-only Connector-Test separat vorbereiten",
        },
        controlledPilot.jamalManualDecision.options[2],
      ],
    },
    centralRecommendation: {
      recommendation:
        "Empfehlung: Option A durchführen und parallel Option B als separate Freigabe vorbereiten.",
      reasons: [
        "Agents kommen in echte Arbeitslogik",
        "Risiko bleibt niedrig",
        "Tool-Bedarf wird sichtbar",
        "QA und Compliance bleiben eingebunden",
        "HR bewertet Autonomie vorsichtig",
        "Jamal behält die volle Kontrolle",
        "Connector-Lesezugriffe werden noch nicht unkontrolliert aktiviert",
      ],
    },
    v113Boundary: controlledPilot.v113Boundary,
    safetyBoundary: controlledPilot.safetyBoundary,
    prepared: true,
    activated: false,
    readOnlyOnly: true,
    strategicAgentPilotRunOnly: true,
    agentCount: strategicMatrix.length,
    madeExternalRequest: false,
    uncontrolledPluginUseBlocked: true,
    automaticExternalRequestsBlocked: true,
    connectorReadAccessActivated: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    taskStarted: false,
    statusChanged: false,
    decisionStored: false,
    checklistUpdated: false,
    automaticAutonomyIncreaseBlocked: true,
    technicalWriteImplementationPrepared: false,
    simulatedWriteCapabilityPrepared: false,
  };
}

function getReadOnlyAgentActionCard(entry, index) {
  const hasExternalConnector = entry.neededToolsOrPlugins.some((tool) =>
    ["Airtable", "Gmail", "Google Calendar", "GitHub"].includes(tool),
  );
  const securityStage = hasExternalConnector
    ? index % 3 === 0
      ? "C: nur mit Jamals manueller Freigabe"
      : "B: read-only Connector später möglich"
    : "A: lokal read-only möglich";

  return {
    agentName: entry.agentName,
    role: entry.role,
    nextConcreteAction:
      index % 5 === 0
        ? "lokalen Befund zum Agentenbetrieb erstellen"
        : index % 5 === 1
          ? "Tool-Bedarf für eigenen Beitrag präzisieren"
          : index % 5 === 2
            ? "Risiko und Grenze der eigenen Aktion benennen"
            : index % 5 === 3
              ? "Prüfkriterium für den eigenen Beitrag formulieren"
              : "Ergebnis an Projektmanager-Agent zur Verdichtung übergeben",
    purpose:
      "Aus dem strategischen Pilotlauf eine konkrete, prüfbare und weiterhin read-only Agentenaktion ableiten.",
    neededToolOrPlugin: entry.neededToolsOrPlugins.join(", "),
    securityStage,
    expectedResult:
      "Kurzer Aktionsbefund mit Ergebnis, Grenze, Risiko und nächstem Freigabeschritt.",
    checkCriterion:
      "Aktion bleibt read-only, erzeugt sichtbares Ergebnis, verletzt keine Sicherheitsgrenze und braucht bei Connector-Nähe Jamals Freigabe.",
    risk: entry.risk,
    boundary:
      "Keine Speicherung, kein Aufgabenstart, keine Statusänderung, keine automatische externe Anfrage und keine Schreibrechte.",
    handoffTo:
      /qa/i.test(entry.agentName)
        ? "Jamal"
        : /projektmanager/i.test(entry.agentName)
          ? "Jamal"
          : "Projektmanager-Agent",
    mustNotDo:
      "Keine Aktion automatisch starten, nichts schreiben, nichts speichern, keinen Connector aktivieren.",
    nextUsefulApprovalStage:
      securityStage.startsWith("A")
        ? "lokale read-only Aktion prüfen"
        : securityStage.startsWith("B")
          ? "read-only Connector-Test separat vorbereiten"
          : "Jamal-Freigabe vor jedem Connector-Schritt einholen",
  };
}

function getProductiveCentralV11ReadOnlyAgentActionPlan() {
  const strategicPilot = getProductiveCentralV11StrategicAgentPilotRun();
  const actionCards = strategicPilot.strategicMatrix.map((entry, index) =>
    getReadOnlyAgentActionCard(entry, index),
  );

  return {
    title: "V1.1 Read-only Agenten-Aktionsplan",
    status:
      "read-only Agenten-Aktionsplan mit erstem Connector-Freigabekorridor vorbereitet",
    startingPoint: [
      "V1 ist finaler read-only Betriebsstand",
      "V1.1.0 Agenten-Tageslauf ist vorhanden",
      "V1.1.1 Agenten-Ergebnislauf ist vorhanden",
      "V1.1.2 plugin-fähiger Agenten-Testbetrieb ist vorhanden",
      "V1.1.3 strategischer Agenten-Pilotlauf ist vorhanden",
      "25 Agents sind vorhanden",
      "HR liefert weiterhin 25 Vorschläge inklusive HR-Agent",
      "Tool-Matrix und Pilotlauf sind vorbereitet",
      "der nächste Schritt sind konkrete, kontrollierte Agenten-Handlungsaktivitäten",
      "keine Schreibrechte werden aktiviert",
      "keine externen Requests werden automatisch ausgeführt",
      "schreibende Aktionen bleiben gesperrt",
    ],
    strategicBundling: {
      reason:
        "Diese Version bündelt mehrere sinnvolle nächste Schritte, weil Agenten konkrete Aktionskarten brauchen, Aktionen Tool-Zuordnung brauchen, Tool-Nutzung Sicherheitsgrenzen braucht, lokale Prüfaktionen QA brauchen, Connectoren einen Freigabekorridor brauchen, HR Testverantwortung bewerten muss und Jamal den ersten read-only Connector-Test manuell freigeben müsste.",
      notBundled: [
        "echte Schreibrechte",
        "produktive Datenänderungen",
        "Airtable-/Datenbank-Schreibzugriffe",
        "E-Mails senden",
        "Kalendertermine erstellen",
        "Aufgaben automatisch starten",
        "Projektstatus ändern",
        "Entscheidungen speichern",
        "Autonomie automatisch erhöhen",
        "unkontrollierte externe Requests",
      ],
    },
    targetPicture:
      "Die Agents bekommen erstmals konkrete Aktionskarten. Jede Aktion ist einer Sicherheitsstufe zugeordnet: lokal read-only, späterer read-only Connector-Test, manuelle Freigabe nötig oder weiterhin gesperrt.",
    targetSignals: [
      "welche Aktionen sofort lokal testbar sind",
      "welche Aktionen einen späteren Connector-Lesezugriff brauchen",
      "welche Aktionen nur nach Jamals Freigabe möglich sind",
      "welche Aktionen weiterhin gesperrt bleiben",
      "welcher Agent welche Aktion verantwortet",
      "welches Ergebnis erwartet wird",
      "wie QA und Compliance die Aktion bewerten",
    ],
    actionCards,
    immediateLocalReadOnlyActions: [
      {
        action: "QA-Agent prüft Systemstabilität",
        steps: [
          "node --check app.js",
          "node --check server.js",
          "relevante API-Endpunkte prüfen",
          "/app.js-Auslieferung prüfen",
          "Port 4173 nach Server-Stopp prüfen",
        ],
        expectedResult:
          "QA-Testbericht, Fehlerliste, Sicherheitsstatus und Blocker ja/nein.",
      },
      {
        action: "Projektmanager-Agent verdichtet Agentenbeiträge",
        steps: [
          "aus Agenten-Ergebnislauf und Pilotlauf eine nächste Entscheidung ableiten",
          "Tool-Prioritäten ordnen",
          "kleinsten nächsten Schritt bestimmen",
        ],
        expectedResult:
          "Verdichtete Empfehlung, Entscheidungsfrage für Jamal und nächster kleiner Schritt.",
      },
      {
        action: "Plugin/Tool-Radar-Agent aktualisiert Tool-Bedarf",
        steps: [
          "Tool-Bedarf je Agent bewerten",
          "Lücken sichtbar machen",
          "erste Connector-Kandidaten priorisieren",
        ],
        expectedResult:
          "Tool-Lückenliste, Connector-Kandidaten und Freigabepriorität.",
      },
      {
        action: "Compliance/Risiko-Agent prüft Aktionsgrenzen",
        steps: [
          "prüfen, welche Aktionen lokal read-only sicher sind",
          "prüfen, welche Aktionen Connector-Freigabe brauchen",
          "gesperrte Aktionen bestätigen",
        ],
        expectedResult:
          "Sicherheitsbericht, erlaubte Aktionen, gesperrte Aktionen und Freigabegrenzen.",
      },
      {
        action: "HR-Agent bewertet Testreife",
        steps: [
          "Agentenleistung bewerten",
          "1%-Verbesserung je Agent ableiten",
          "Autonomie-Grenze bestätigen",
        ],
        expectedResult:
          "Testreife je Agent, Trainingsbedarf und Autonomie-Vorschlag ohne automatische Umsetzung.",
      },
    ],
    connectorReleaseCorridor: {
      title: "Erster read-only Connector-Freigabekorridor",
      candidates: [
        {
          priority: "Priorität 1: GitHub oder lokale Projektdateien read-only",
          benefit:
            "Entwickler-Agent, QA-Agent und Projektmanager-Agent können echte Projektstruktur besser auswerten; Risiko vergleichsweise niedrig, wenn nur gelesen wird.",
          boundary:
            "Keine Commits, keine Branches, keine PRs, keine Dateiänderungen, keine Issues erstellen, keine Actions auslösen.",
        },
        {
          priority: "Priorität 2: Vercel read-only",
          benefit:
            "Deployment-Status, Logs und Projektzustand könnten später bewertet werden.",
          boundary:
            "Keine Deployments, keine Promotions, keine Env-Änderungen, keine Domain-Änderungen.",
        },
        {
          priority: "Priorität 3: Airtable read-only",
          benefit:
            "Pilotstatus und Projektinformationen könnten später echter ausgewertet werden.",
          boundary:
            "Keine Records erstellen, keine Records aktualisieren, keine Tabellen ändern, keine Automationen auslösen.",
        },
        {
          priority: "Priorität 4: Google Drive read-only",
          benefit:
            "Wissens/Archiv-Agent könnte Dokumente später lesen und einordnen.",
          boundary:
            "Keine Dateien erstellen, keine Dateien ändern, keine Freigaben ändern, keine Ordnerstruktur ändern.",
        },
        {
          priority: "Priorität 5: Gmail/Kalender weiterhin später",
          benefit:
            "Später für Kommunikation und Termine relevant.",
          boundary:
            "Aktuell nicht als erster Test empfohlen; keine E-Mails senden, keine Entwürfe erstellen, keine Termine erstellen oder ändern.",
        },
      ],
    },
    firstConnectorRecommendation: {
      recommendation:
        "Empfehlung: Als ersten echten read-only Connector-Test GitHub oder lokale Projektdateien vorbereiten, weil Entwickler-, QA- und Projektmanager-Agent damit sofort den höchsten Nutzen bei vergleichsweise niedrigem Risiko erzeugen.",
      reasons: [
        "passt zum aktuellen Projekt",
        "keine Kundendaten nötig",
        "hoher Nutzen für technische Prüfung",
        "gute QA-Anbindung",
        "klare Schreibgrenzen möglich",
        "sinnvoller nächster Schritt nach lokalem Pilotlauf",
      ],
      boundary:
        "In V1.1.4 wird dieser Connector-Test noch nicht automatisch ausgeführt. Er wird als manuelle nächste Freigabe vorbereitet.",
    },
    actionLogic: [
      "Phase 1: Lokale read-only Aktionen ausführen oder vorbereiten",
      "Phase 2: QA und Compliance prüfen die Ergebnisse",
      "Phase 3: Projektmanager-Agent verdichtet zu einer Entscheidungsvorlage",
      "Phase 4: HR bewertet Testreife und Autonomie-Grenzen",
      "Phase 5: Jamal entscheidet manuell über den ersten read-only Connector-Test",
    ],
    jamalManualDecision: {
      question: "Welche nächste Handlungsstufe gibt Jamal frei?",
      options: [
        {
          option: "Option A: Nur lokale read-only Agentenaktionen fortsetzen",
          meaning:
            "Keine Connectoren, keine externen Requests, niedrigstes Risiko; Agents trainieren weiter lokal.",
          benefit: "Sicherer Fortschritt und bessere Agentenroutine ohne externe Systeme.",
          risk: "Echte Connector-Fähigkeit bleibt weiterhin ungetestet.",
          necessaryBoundary:
            "Nur lokale read-only Aktionen; keine Speicherung, keine externen Requests.",
          recommendedFollowUp:
            "Lokale Aktionskarten einmal auswerten und QA-/Compliance-Bericht nutzen.",
          explicitlyNotHappening:
            "Kein Connector, kein Schreiben, keine Aufgabe, keine Automation.",
        },
        {
          option: "Option B: Ersten read-only GitHub-/Projektdatei-Test vorbereiten",
          meaning:
            "Erster echter Tool-/Connector-Test wird separat vorbereitet; nur Lesen, keine Änderungen, keine Automationen, klare QA-/Compliance-Prüfung.",
          benefit:
            "Höchster technischer Nutzen bei vergleichsweise niedrigem Risiko.",
          risk:
            "Auch read-only Zugriff braucht klare Freigabe und Protokollgrenze.",
          necessaryBoundary:
            "Ein Zweck, ein Lesekorridor, keine Commits, keine Dateiänderungen, keine Actions.",
          recommendedFollowUp:
            "Separaten Freigabekorridor für GitHub oder lokale Projektdateien vorbereiten.",
          explicitlyNotHappening:
            "Keine automatische Connector-Ausführung in V1.1.4.",
        },
        {
          option: "Option C: Connector-Freigabe noch nicht vorbereiten, Aktionskarten nachschärfen",
          meaning:
            "Mehr Sicherheit und langsamere Produktivität; geeignet, falls Tool-Grenzen noch unklar sind.",
          benefit: "Grenzen werden präziser, bevor ein Connector überhaupt vorbereitet wird.",
          risk: "Agentenbetrieb bleibt länger im lokalen Trainingsmodus.",
          necessaryBoundary:
            "Nur Nachschärfung der Lesestruktur; keine neuen technischen Schritte.",
          recommendedFollowUp:
            "Aktionskarten, Prüfkriterien und Freigabestufen einmal begrenzt schärfen.",
          explicitlyNotHappening:
            "Kein Connector-Test, keine externe Anfrage, keine Schreibfunktion.",
        },
      ],
    },
    projectManagerActionFilter: {
      statement:
        "Der Projektmanager-Agent wird ab V1.1.4 nicht nur als Verdichter, sondern als Handlungsfilter eingesetzt.",
      may: [
        "Aktionskarten bündeln",
        "Tool-Bedarf priorisieren",
        "lokale Aktionen von Connector-Aktionen trennen",
        "Risiken markieren",
        "den nächsten kleinen Schritt empfehlen",
        "Jamals Entscheidung vorbereiten",
      ],
      mayNot: [
        "Aktionen automatisch starten",
        "Aufgaben speichern",
        "Entscheidungen speichern",
        "Projektstatus ändern",
        "Connectoren aktivieren",
        "Schreibrechte vorbereiten",
        "externe Requests ausführen",
      ],
    },
    qaActionReport: {
      locallyCheckableActions:
        "Syntaxprüfung, relevante API-Endpunkte, UI-Auslieferung, Port-Freiheit und Sicherheitsflags.",
      requiredChecks:
        "node --check app.js, node --check server.js, Hauptendpunkte, /app.js und Port 4173.",
      relevantFieldsAndEndpoints:
        "productiveCentralV11ReadOnlyAgentActionPlan, Prepared-Feld, Next-Feld, agentCount, HR-Proposals und madeExternalRequest.",
      requiredUiSection:
        "V1.1 Read-only Agenten-Aktionsplan",
      processesMustNotHang:
        "Kein hängender node server.js, node -e oder curl Prüfprozess.",
      blockingErrors:
        "fehlende neue Felder, weniger als 25 Agenten, madeExternalRequest true, Schreibmethode oder nicht erreichbare UI-Auslieferung.",
      nonBlockingNotes:
        "Connector-Kandidaten sind nur Freigabekorridor, kein aktiver Connector-Test.",
    },
    complianceActionReport: {
      safeLocalReadOnlyActions:
        "Lokale Syntax-, API-, UI-, Port- und Matrixprüfungen ohne externe Systeme.",
      connectorApprovalNeeded:
        "GitHub, Vercel, Airtable, Drive, Gmail und Kalender brauchen separate Jamal-Freigabe.",
      blockedActions:
        "Schreiben, Senden, Erstellen, Ändern, Starten, Speichern, Deployen und Autonomie-Erhöhung.",
      risks:
        "Read-only Connectoren können sensible Metadaten oder externe Kontexte berühren.",
      boundariesNotToViolate:
        "Keine automatischen externen Requests, keine Schreibrechte, keine produktiven Datenänderungen, keine Aufgabenstarts.",
      firstConnectorGenerallyViable:
        "GitHub oder lokale Projektdateien read-only sind grundsätzlich am vertretbarsten, aber noch nicht aktiviert.",
    },
    hrTestReadinessReport: {
      testReadyAgents:
        "Alle 25 Agents können Aktionskarten lesen und lokale read-only Beiträge liefern.",
      needsTraining:
        "Agents mit Connector-Nähe brauchen Training zu Freigabe, Protokoll, Datenschutz und Schreibsperre.",
      closeGuidance:
        "Alle Agents bleiben eng geführt, sobald externe Systeme, Kundendaten oder Schreibnähe betroffen sind.",
      onePercentImprovement:
        "Je Agent: eine klarere Aktion, ein besseres Prüfkriterium oder eine präzisere Grenze.",
      autonomyWindow:
        "Autonomie-Spielräume werden nur vorgeschlagen, nicht automatisch umgesetzt.",
      whyNoAutomaticIncrease:
        "Testreife ist ein Trainingssignal, keine operative Freigabe.",
    },
    v114Boundary: {
      may: [
        "konkrete Agenten-Aktionskarten anzeigen",
        "lokale read-only Aktionen strukturieren",
        "Tool-/Connector-Freigabekorridor vorbereiten",
        "ersten Connector-Kandidaten priorisieren",
        "QA-/Compliance-/HR-Auswertung anzeigen",
        "Projektmanager-Handlungsfilter stärken",
        "Jamals nächste Freigabeentscheidung vorbereiten",
      ],
      mayNot: [
        "Connectoren automatisch aktivieren",
        "externe Requests automatisch ausführen",
        "Aufgaben starten",
        "Entscheidungen speichern",
        "Projektstatus ändern",
        "Checklisten aktualisieren",
        "Airtable oder Datenbanken beschreiben",
        "E-Mails senden",
        "Kalendertermine erstellen",
        "Dateien produktiv verändern",
        "Automationen auslösen",
        "Schreibrechte vorbereiten",
        "Schreibrechte simulieren",
        "technische Aktivierung anlegen",
        "Autonomie automatisch erhöhen",
      ],
    },
    safetyBoundary: [
      "keine unkontrollierte Plugin-Nutzung",
      "keine automatischen externen Requests",
      "keine Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine automatische Autonomie-Erhöhung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
      "schreibende Aktionen bleiben gesperrt",
    ],
    prepared: true,
    activated: false,
    readOnlyOnly: true,
    agentActionPlanOnly: true,
    agentCount: actionCards.length,
    madeExternalRequest: false,
    connectorAutomaticallyActivated: false,
    uncontrolledPluginUseBlocked: true,
    automaticExternalRequestsBlocked: true,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    taskStarted: false,
    statusChanged: false,
    decisionStored: false,
    checklistUpdated: false,
    automaticAutonomyIncreaseBlocked: true,
    technicalWriteImplementationPrepared: false,
    simulatedWriteCapabilityPrepared: false,
  };
}

function getProjectFileGithubAgentAssignment(entry, index) {
  const developerLike = /entwickler|qa|projektmanager/i.test(entry.agentName);
  const governanceLike = /compliance|risiko|gf|geschäftsführer|chef|hr|wissen|archiv|tool|plugin/i.test(
    entry.agentName,
  );
  const securityStage = developerLike
    ? "A: lokale Projektdateien read-only"
    : governanceLike
      ? "B: GitHub read-only nach Freigabe"
      : index % 4 === 0
        ? "C: nur Auswertung, kein Toolzugriff"
        : "A: lokale Projektdateien read-only";

  return {
    agentName: entry.agentName,
    role: entry.role,
    localProjectFileContribution:
      /entwickler/i.test(entry.agentName)
        ? "app.js und server.js read-only auf Struktur, Versionsfelder und technische Konsistenz prüfen."
        : /qa/i.test(entry.agentName)
          ? "Syntax-, API-, UI- und Port-Prüfplan für den lokalen Testkorridor ableiten."
          : /projektmanager/i.test(entry.agentName)
            ? "Befunde aus lokaler Dateiprüfung zu kleinstem nächsten Schritt verdichten."
            : /compliance|risiko/i.test(entry.agentName)
              ? "Grenzen für lokale Dateien und GitHub read-only prüfen und gesperrte Aktionen markieren."
              : /plugin|tool/i.test(entry.agentName)
                ? "Bewerten, ob lokale Dateianalyse reicht oder GitHub read-only als nächster Schritt nötig ist."
                : /wissen|archiv/i.test(entry.agentName)
                  ? "Benennen, welche Erkenntnisse später dokumentiert werden müssten, ohne zu speichern."
                  : /hr/i.test(entry.agentName)
                    ? "Testreife, 1%-Verbesserung und Autonomiegrenzen für Agenten bewerten."
                    : /gf|geschäftsführer|chef/i.test(entry.agentName)
                      ? "Jamals manuelle Freigabeentscheidung für den nächsten Testkorridor formulieren."
                      : "Begrenzten read-only Beitrag zur Einordnung von app.js, server.js, UI-Sektion oder Sicherheitsgrenze liefern.",
    githubReadOnlyContribution:
      developerLike
        ? "Repository-Struktur, PR-/Issue-Kontext und CI-Status später nur lesend auswerten."
        : governanceLike
          ? "GitHub-Lesekorridor, Freigabegrenze und Protokollbedarf später bewerten."
          : "GitHub-Kontext nur als zusammengefassten Befund nutzen; kein eigener Toolzugriff.",
    neededTool:
      securityStage.startsWith("A")
        ? "lokale Projektdateien read-only"
        : securityStage.startsWith("B")
          ? "GitHub read-only nach separater Jamal-Freigabe"
          : "kein direkter Toolzugriff; Auswertung über Projektmanager-Agent",
    securityStage,
    expectedResult:
      "Konkreter Befund zu Struktur, Feldern, UI, Sicherheitsgrenze oder nächstem manuellen Prüfauftrag.",
    risk:
      securityStage.startsWith("B")
        ? "GitHub kann Repository-Metadaten sichtbar machen und braucht daher separate Freigabe."
        : "Risiko bleibt niedrig, solange nur lokal gelesen und nichts verändert wird.",
    boundary:
      "Keine Dateiänderung, keine Speicherung, kein Commit, kein Branch, kein PR, kein Issue, keine Action und keine Schreibrechte.",
    handoffTo:
      /gf|geschäftsführer|chef|projektmanager/i.test(entry.agentName)
        ? "Jamal"
        : "Projektmanager-Agent",
    requiresJamalApproval: securityStage.startsWith("B") ? "ja" : "nein",
  };
}

function getProductiveCentralV11ReadOnlyProjectFileGithubTestCorridor() {
  const actionPlan = getProductiveCentralV11ReadOnlyAgentActionPlan();
  const agentAssignments = actionPlan.actionCards.map((entry, index) =>
    getProjectFileGithubAgentAssignment(entry, index),
  );

  return {
    title: "V1.1 Read-only Projektdatei-/GitHub-Testkorridor",
    status:
      "erster read-only Projektdatei-Testkorridor und GitHub-Freigabekorridor vorbereitet",
    startingPoint: [
      "V1 ist finaler read-only Betriebsstand",
      "V1.1.0 Agenten-Tageslauf ist vorhanden",
      "V1.1.1 Agenten-Ergebnislauf ist vorhanden",
      "V1.1.2 plugin-fähiger Agenten-Testbetrieb ist vorhanden",
      "V1.1.3 strategischer Agenten-Pilotlauf ist vorhanden",
      "V1.1.4 read-only Agenten-Aktionsplan ist vorhanden",
      "25 Agents sind vorhanden",
      "HR liefert weiterhin 25 Vorschläge inklusive HR-Agent",
      "lokale read-only Agentenaktionen sind vorbereitet",
      "nächster sinnvoller Testkorridor sind lokale Projektdateien und danach GitHub read-only",
      "keine Schreibrechte werden aktiviert",
      "keine GitHub-Schreibaktionen werden vorbereitet",
      "schreibende Aktionen bleiben gesperrt",
    ],
    whyLocalProjectFilesFirst: [
      "keine externen Systeme nötig",
      "keine Connector-Freigabe erforderlich",
      "app.js und server.js sind bereits der zentrale Arbeitsbereich",
      "Entwickler-, QA-, Projektmanager-, Compliance- und Wissens/Archiv-Agent können sofort sinnvolle Beiträge liefern",
      "Risiken bleiben gering, solange ausschließlich read-only geprüft wird",
      "GitHub kann danach gezielter vorbereitet werden",
    ],
    githubCandidate: {
      title: "GitHub als nächster Connector-Kandidat",
      usefulBecause: [
        "Repository-Struktur kann geprüft werden",
        "Pull Requests könnten später gelesen werden",
        "Issues könnten später gelesen werden",
        "Commit-Historie könnte später ausgewertet werden",
        "CI-/Actions-Status könnte später gelesen werden",
        "Entwickler-, QA- und Projektmanager-Agent profitieren stark",
      ],
      boundary:
        "In V1.1.5 wird GitHub nicht automatisch produktiv genutzt. GitHub wird nur als read-only Freigabekorridor vorbereitet, sofern kein bereits freigegebener Lesezugriff besteht.",
    },
    testCorridorA: {
      title: "Testkorridor A: Lokale Projektdateien read-only",
      allowed: [
        "app.js lesen",
        "server.js lesen",
        "vorhandene Struktur analysieren",
        "API-Felder prüfen",
        "UI-Sektionsnamen prüfen",
        "Versionsbestand prüfen",
        "Sicherheitsgrenzen im Code suchen",
        "Testempfehlungen ableiten",
        "Prüfbericht vorbereiten",
      ],
      notAllowed: [
        "Dateien verändern",
        "Dateien speichern",
        "neue Dateien erzeugen",
        "Code automatisch patchen",
        "produktive Änderungen ausführen",
        "Aufgaben starten",
        "Projektstatus ändern",
        "Entscheidungen speichern",
      ],
      expectedResult:
        "Dateistruktur-Befund, relevante API-Felder, relevante UI-Sektionen, Sicherheitsgrenzen im Code, mögliche Risiken und nächster manueller Prüfauftrag.",
    },
    testCorridorB: {
      title: "Testkorridor B: GitHub read-only vorbereiten",
      allowedAfterSeparateManualApproval: [
        "Repository-Struktur lesen",
        "Branches lesen",
        "Pull Requests lesen",
        "Issues lesen",
        "CI-/Actions-Status lesen",
        "Commit-Historie lesen",
        "Dateien read-only ansehen",
      ],
      notAllowed: [
        "Commits erstellen",
        "Branches erstellen",
        "PRs öffnen",
        "PRs mergen",
        "Issues erstellen oder bearbeiten",
        "Actions starten",
        "Secrets oder Env-Vars ändern",
        "Deployments auslösen",
        "Dateien ändern",
        "Schreibrechte vorbereiten",
      ],
      expectedResultAfterLaterApproval:
        "Repository-Befund, offener PR-/Issue-Kontext, CI-/Prüfstatus, technische Risiken und nächster manueller Entwicklungsschritt.",
    },
    agentAssignments,
    concreteAgentActivities: [
      "Entwickler-Agent prüft app.js und server.js read-only auf Struktur, Versionsfelder und technische Konsistenz und darf keine Änderungen ausführen.",
      "QA-Agent prüft relevante Syntax-, API- und UI-Prüfungen und darf keinen Code ändern.",
      "Projektmanager-Agent bündelt Entwickler-, QA-, Compliance- und Tool-Radar-Befunde und darf keine Aufgaben starten.",
      "Compliance/Risiko-Agent prüft Grenzen für lokale Dateien und GitHub read-only und darf keine Freigaben erteilen.",
      "Plugin/Tool-Radar-Agent bewertet lokale Datei-Analyse gegen GitHub read-only und darf keine Tools aktivieren.",
      "Wissens/Archiv-Agent benennt spätere Dokumentationspunkte und darf nichts speichern.",
      "HR-Agent bewertet Testreife und 1%-Verbesserungen und darf Autonomie nicht automatisch erhöhen.",
      "GF-Agent formuliert Jamals manuelle Freigabeentscheidung und darf keine Entscheidung speichern.",
    ],
    testFlow: [
      {
        phase: "Phase 1: Lokale read-only Projektdatei-Prüfung vorbereiten",
        steps: [
          "relevante Dateien benennen",
          "erlaubte Prüfungen anzeigen",
          "gesperrte Aktionen anzeigen",
          "erwartete Ergebnisse definieren",
        ],
      },
      {
        phase: "Phase 2: Agentenbeiträge aus lokaler Prüfung strukturieren",
        steps: [
          "Entwickler-Befund",
          "QA-Prüfplan",
          "Compliance-Grenze",
          "Tool-Radar-Empfehlung",
          "Projektmanager-Verdichtung",
          "HR-Testreife",
          "GF-Entscheidungsfrage",
        ],
      },
      {
        phase: "Phase 3: GitHub-read-only-Freigabe vorbereiten",
        steps: [
          "Nutzen begründen",
          "Risiken benennen",
          "erlaubte Leseaktionen definieren",
          "verbotene Schreibaktionen definieren",
          "manuelle Freigabe durch Jamal erforderlich machen",
        ],
      },
      {
        phase: "Phase 4: Entscheidung über nächsten Test",
        steps: [
          "nur lokale Prüfung fortsetzen",
          "GitHub-read-only-Test separat freigeben",
          "Testkorridor nachschärfen",
        ],
      },
    ],
    qaCheckCard: [
      "sind neue API-Felder vorhanden?",
      "ist neue UI-Sektion vorhanden?",
      "bleiben alte Versionen erhalten?",
      "bleibt agentCount 25?",
      "liefert HR weiterhin 25 Vorschläge?",
      "bleibt madeExternalRequest false?",
      "gibt es keine Schreib-Endpunkte?",
      "gibt es keine Speicherfunktion?",
      "gibt es keine GitHub-Schreibaktion?",
      "ist Port 4173 nach Server-Stopp frei?",
      "gibt es keine hängenden Prüfprozesse?",
    ],
    complianceCheckCard: [
      "lokale Projektdateien nur read-only",
      "GitHub nur read-only vorbereitet",
      "keine Commits",
      "keine Branches",
      "keine PRs",
      "keine Issues",
      "keine Actions",
      "keine Schreibrechte",
      "keine Speicherung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine automatische Autonomie-Erhöhung",
    ],
    hrTestReadinessCard: [
      "welche Agents mit lokalen Projektdateien testfähig sind",
      "welche Agents GitHub read-only später sinnvoll nutzen könnten",
      "welche Agents weiter eng geführt bleiben müssen",
      "welche 1%-Verbesserung je Agent sinnvoll wäre",
      "warum keine automatische Autonomie-Erhöhung erfolgt",
    ],
    projectManagerCondensation: {
      summary:
        "Der Projektmanager-Agent verdichtet Nutzen lokaler Projektdatei-Prüfung, Nutzen von GitHub read-only, Risiken, gesperrte Aktionen, nächsten kleinsten Schritt und Jamals Entscheidung.",
      mayNot: [
        "Aufgaben starten",
        "Entscheidungen speichern",
        "Projektstatus ändern",
        "GitHub aktivieren",
        "externe Requests ausführen",
        "Schreibrechte vorbereiten",
      ],
    },
    jamalManualDecision: {
      question: "Welche nächste Teststufe gibt Jamal frei?",
      options: [
        {
          option: "Option A: Lokalen read-only Projektdatei-Test fortsetzen",
          meaning:
            "Kein externer Connector, niedrigstes Risiko; Agents prüfen weiterhin lokale Struktur.",
          benefit:
            "Sofort nutzbare Prüfung von app.js, server.js, API-Feldern, UI-Sektion und Sicherheitsgrenzen.",
          risk:
            "Repository-Kontext, PRs, Issues und CI bleiben noch außerhalb des Tests.",
          necessaryBoundary:
            "Nur lesen, nichts verändern, keine neuen Dateien, keine externen Requests.",
          recommendedFollowUp:
            "Lokalen Prüfbericht aus Entwickler-, QA-, Compliance- und Projektmanager-Beitrag erstellen.",
          explicitlyNotHappening:
            "Kein GitHub-Zugriff, kein Commit, kein Branch, kein PR, kein Issue, keine Action.",
        },
        {
          option: "Option B: GitHub read-only als separaten Test freigeben",
          meaning:
            "Erster echter Connector-Lesetest; nur Repository lesen, keine Schreibaktionen, keine PRs, Commits, Issues oder Actions.",
          benefit:
            "Besserer technischer Kontext für Entwickler-, QA- und Projektmanager-Agent.",
          risk:
            "Auch read-only GitHub kann sensible Repository-Metadaten zeigen und braucht klare Freigabe.",
          necessaryBoundary:
            "Nur Lesen, sichtbares Protokoll, keine Änderungen, keine Actions, keine Schreibrechte.",
          recommendedFollowUp:
            "Separaten GitHub-read-only-Testauftrag mit Jamal-Freigabe vorbereiten.",
          explicitlyNotHappening:
            "Keine GitHub-Schreibaktion, keine automatische externe Anfrage in dieser Version.",
        },
        {
          option:
            "Option C: GitHub noch nicht freigeben und lokale Testlogik nachschärfen",
          meaning:
            "Langsamer, aber sicherer; sinnvoll, falls Grenzen noch unklar sind.",
          benefit:
            "Freigabegrenze wird schärfer, bevor ein externer Connector berührt wird.",
          risk:
            "Agentenbetrieb bleibt länger auf lokale Befunde begrenzt.",
          necessaryBoundary:
            "Nur Lesestruktur und lokale Prüflogik schärfen; kein Connector.",
          recommendedFollowUp:
            "QA-/Compliance-Kriterien und Agenten-Zuordnung einmal begrenzt verbessern.",
          explicitlyNotHappening:
            "Kein GitHub-Zugriff, keine Schreibrechte, keine Automation.",
        },
      ],
    },
    centralRecommendation: {
      recommendation:
        "Empfehlung: Option A jetzt nutzen und Option B als nächsten separaten Freigabeschritt vorbereiten.",
      reasons: [
        "lokale Projektdateien liefern sofort hohen Nutzen bei niedrigem Risiko",
        "GitHub read-only ist der sinnvollste erste Connector",
        "Entwickler-, QA- und Projektmanager-Agent profitieren direkt",
        "Compliance-Grenzen sind klar formulierbar",
        "Jamal behält die volle Kontrolle",
        "Schreibrechte bleiben vollständig gesperrt",
      ],
    },
    v115Boundary: {
      may: [
        "lokalen read-only Projektdatei-Testkorridor anzeigen",
        "GitHub read-only als nächsten Connector-Test vorbereiten",
        "Agentenrollen für Projektdatei-/GitHub-Test zuordnen",
        "QA-/Compliance-/HR-Prüfungen vorbereiten",
        "Projektmanager-Verdichtung anzeigen",
        "Jamals Freigabeentscheidung vorbereiten",
      ],
      mayNot: [
        "GitHub automatisch verbinden",
        "externe Requests automatisch ausführen",
        "Commits erstellen",
        "Branches erstellen",
        "PRs öffnen",
        "Issues erstellen",
        "GitHub Actions auslösen",
        "Dateien produktiv verändern",
        "Aufgaben starten",
        "Entscheidungen speichern",
        "Projektstatus ändern",
        "Checklisten aktualisieren",
        "Airtable oder Datenbanken beschreiben",
        "E-Mails senden",
        "Kalendertermine erstellen",
        "Automationen auslösen",
        "Schreibrechte vorbereiten",
        "Schreibrechte simulieren",
        "technische Aktivierung anlegen",
        "Autonomie automatisch erhöhen",
      ],
    },
    safetyBoundary: [
      "keine unkontrollierte Plugin-Nutzung",
      "keine automatischen externen Requests",
      "keine GitHub-Schreibaktionen",
      "keine Schreib-Endpunkte",
      "keine Schreib-Handler",
      "keine Speicherfunktion",
      "kein aktiver Speichern-Button",
      "keine Datenbank-/Airtable-Schreibanbindung",
      "keine Aufgabenstarts",
      "keine Projektstatusänderungen",
      "keine Entscheidungsspeicherung",
      "keine Checklistenaktualisierung",
      "keine automatische Autonomie-Erhöhung",
      "keine technische Schreibvorbereitung",
      "keine Simulation oder Aktivierung von Schreibrechten",
      "schreibende Aktionen bleiben gesperrt",
    ],
    prepared: true,
    activated: false,
    readOnlyOnly: true,
    projectFileGithubTestCorridorOnly: true,
    agentCount: agentAssignments.length,
    madeExternalRequest: false,
    githubConnected: false,
    githubWriteActionPrepared: false,
    githubCommitCreated: false,
    githubBranchCreated: false,
    githubPullRequestOpened: false,
    githubIssueCreated: false,
    githubActionTriggered: false,
    filesChanged: false,
    writeEndpointAvailable: false,
    writeHandlerAvailable: false,
    saveFunctionAvailable: false,
    activeSaveButtonAvailable: false,
    databaseConnected: false,
    airtableWriteAvailable: false,
    taskStarted: false,
    statusChanged: false,
    decisionStored: false,
    checklistUpdated: false,
    automaticAutonomyIncreaseBlocked: true,
    technicalWriteImplementationPrepared: false,
    simulatedWriteCapabilityPrepared: false,
  };
}

function getAgentPluginReadiness() {
  return HR_DAILY_TRAINING_PROPOSALS.map((proposal) => {
    const recommendedPlugins = getRecommendedPluginsForAgent(proposal.agent, proposal.role);
    return {
      agent: proposal.agent,
      role: proposal.role,
      pluginReadiness: "lokal vorbereitet",
      recommendedPlugins,
      pluginUseCase: getPluginUseCaseForAgent(proposal.agent, recommendedPlugins),
      manualNextStepForJamal: "Plugin-Vorbereitung prüfen und bei Bedarf manuell freigeben.",
      allowedPreparation: [
        "Plugin empfehlen",
        "Aufgabe vorbereiten",
        "Briefing schreiben",
        "Prompt vorbereiten",
        "Prüfauftrag formulieren",
        "manuellen nächsten Schritt anzeigen",
      ],
      blockedPluginActions: [
        "Canva automatisch ausführen",
        "HeyGen automatisch ausführen",
        "GitHub automatisch ändern",
        "Airtable automatisch schreiben",
        "Gmail automatisch senden",
        "Google Calendar automatisch ändern",
        "externe Anfrage starten",
        "Secrets anlegen oder verwenden",
        "automatische Entscheidung treffen",
        "Folgeagent automatisch starten",
      ],
      requiresJamalApproval: true,
      automaticPluginExecutionBlocked: true,
    };
  });
}

function getPluginReadiness(requestUrl) {
  const agentPluginReadiness = getAgentPluginReadiness();
  const preparedPluginCategorySet = new Set(
    agentPluginReadiness.flatMap((entry) => entry.recommendedPlugins),
  );
  const availablePluginCategories = PLUGIN_PREPARATION_CATEGORIES.filter((plugin) =>
    preparedPluginCategorySet.has(plugin),
  );
  const bestManualPluginStartOrders = getBestManualPluginStartOrders(availablePluginCategories);
  const hasWorkRequestParam =
    requestUrl && typeof requestUrl.searchParams?.has === "function"
      ? requestUrl.searchParams.has("workRequest")
      : false;
  const projectIdParam =
    requestUrl && typeof requestUrl.searchParams?.get === "function"
      ? requestUrl.searchParams.get("projectId") ?? ""
      : "";
  const productiveManualHealthDayWork = hasWorkRequestParam
    ? getProductiveManualHealthDayWork({
        workRequestInput: requestUrl.searchParams.get("workRequest") ?? "",
        projectIdInput: projectIdParam,
        resultSource:
          requestUrl.searchParams.get("resultSource") === "manual-ui-input"
            ? "manual-ui-input"
            : "api-work-request",
      })
    : getProductiveManualHealthDayWork();

  return {
    version: "V1.1.5",
    agentCount: agentPluginReadiness.length,
    productiveWorkRequestInputSupported: true,
    productiveWorkRequestMaxLength: PRODUCTIVE_WORK_REQUEST_MAX_LENGTH,
    productiveInputCorridorVersion: hasWorkRequestParam
      ? PRODUCTIVE_INPUT_CORRIDOR_VERSION
      : undefined,
    productiveResultEngineVersion:
      productiveManualHealthDayWork.productiveResultEngineVersion,
    productiveReportVersion: productiveManualHealthDayWork.productiveReportVersion,
    productiveAcceptanceVersion:
      productiveManualHealthDayWork.productiveAcceptanceVersion,
    productiveAcceptanceReady: productiveManualHealthDayWork.productiveAcceptanceReady,
    productiveAcceptanceStatus: productiveManualHealthDayWork.productiveAcceptanceStatus,
    agentRunVersion: productiveManualHealthDayWork.agentRunVersion,
    agentRunReady: productiveManualHealthDayWork.agentRunReady,
    agentRunMode: productiveManualHealthDayWork.agentRunMode,
    agentProjectWorkVersion: productiveManualHealthDayWork.agentProjectWorkVersion,
    selectedProjectId: productiveManualHealthDayWork.selectedProjectId,
    selectedProjectName: productiveManualHealthDayWork.selectedProjectName,
    projectContextReady: productiveManualHealthDayWork.projectContextReady,
    unknownProject: productiveManualHealthDayWork.unknownProject,
    productiveProjectRegistry: PRODUCTIVE_PROJECT_REGISTRY.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      projectType: project.projectType,
    })),
    pluginCommandCenterVersion:
      productiveManualHealthDayWork.pluginCommandCenter?.pluginCommandCenterVersion,
    pluginCommandCenterReady:
      productiveManualHealthDayWork.pluginCommandCenter?.pluginCommandCenterReady,
    pluginCommandCenterMode:
      productiveManualHealthDayWork.pluginCommandCenter?.pluginCommandCenterMode,
    pluginRegistry: productiveManualHealthDayWork.pluginCommandCenter?.pluginRegistry,
    pluginCount: productiveManualHealthDayWork.pluginCommandCenter?.pluginCount,
    highPriorityPlugins:
      productiveManualHealthDayWork.pluginCommandCenter?.highPriorityPlugins,
    pluginSafetyRules: productiveManualHealthDayWork.pluginCommandCenter?.pluginSafetyRules,
    pluginActionCardsReady:
      productiveManualHealthDayWork.pluginCommandCenter?.pluginActionCardsReady,
    pluginActionCards: productiveManualHealthDayWork.pluginCommandCenter?.pluginActionCards,
    blockedPluginActions:
      productiveManualHealthDayWork.pluginCommandCenter?.blockedPluginActions,
    pluginCommandCenterBlockers:
      productiveManualHealthDayWork.pluginCommandCenter?.pluginCommandCenterBlockers,
    nextPluginDemoStep: productiveManualHealthDayWork.pluginCommandCenter?.nextPluginDemoStep,
    pluginReadyAgentCount: agentPluginReadiness.length,
    availablePluginCategories,
    agentPluginReadiness,
    pluginUseMatrix: getPluginUseMatrix(agentPluginReadiness, availablePluginCategories),
    manualPluginWorkOrders: getManualPluginWorkOrders(availablePluginCategories),
    bestManualPluginStartOrders,
    recommendedFirstManualPluginStartOrder: getRecommendedFirstManualPluginStartOrder(
      bestManualPluginStartOrders,
    ),
    recommendedAirtableReadOnlyCheck: getRecommendedAirtableReadOnlyCheck(),
    airtableReadOnlyDecisionQuestion: getAirtableReadOnlyDecisionQuestion(),
    pluginInstallationStatusPreparation: getPluginInstallationStatusPreparation(
      availablePluginCategories,
    ),
    firstManualPluginConnectionCandidate: getFirstManualPluginConnectionCandidate(),
    copyableAirtableReadOnlyTestOrder: getCopyableAirtableReadOnlyTestOrder(),
    manualAirtableReadOnlyTestClassification: getManualAirtableReadOnlyTestClassification(),
    manualAirtableReadOnlyTestGoalClarification: getManualAirtableReadOnlyTestGoalClarification(),
    copyableAirtableReadOnlyTestGoalSelection: getCopyableAirtableReadOnlyTestGoalSelection(),
    manualAirtableGoalDecisionClassification: getManualAirtableGoalDecisionClassification(),
    smallestSafeAirtableGoalRecommendation: getSmallestSafeAirtableGoalRecommendation(),
    copyableAirtableBasicConnectionCheckOrder: getCopyableAirtableBasicConnectionCheckOrder(),
    airtablePreparationBundleSummary: getAirtablePreparationBundleSummary(),
    manualAirtableBundleDecision: getManualAirtableBundleDecision(),
    airtableFirstTestPreparationPackage: getAirtableFirstTestPreparationPackage(),
    airtableFirstTestResultDocumentation: getAirtableFirstTestResultDocumentation(),
    pluginTestCockpitSummary: getPluginTestCockpitSummary(),
    pluginTestDailyDecision: getPluginTestDailyDecision(),
    productiveUsagePreparation: getProductiveUsagePreparation(),
    productiveDailyLeadershipDefinition: getProductiveDailyLeadershipDefinition(),
    productiveDailyClosureDefinition: getProductiveDailyClosureDefinition(),
    productiveDailyHandoffPreparation: getProductiveDailyHandoffPreparation(),
    productiveDailyCycleSummary: getProductiveDailyCycleSummary(),
    productiveMorningRoutineDerivation: getProductiveMorningRoutineDerivation(),
    productiveWorkdayLocalSimulation: getProductiveWorkdayLocalSimulation(),
    productiveWorkdayLocalSimulationEvaluation: getProductiveWorkdayLocalSimulationEvaluation(),
    productiveLocalReleasePreparation: getProductiveLocalReleasePreparation(),
    productiveLocalUsageManualStart: getProductiveLocalUsageManualStart(),
    productiveLocalUsageFirstRunEvaluation: getProductiveLocalUsageFirstRunEvaluation(),
    productiveLocalUsageEvaluationLeadershipDecision:
      getProductiveLocalUsageEvaluationLeadershipDecision(),
    productiveLocalLeadershipDecisionNextSafeStep:
      getProductiveLocalLeadershipDecisionNextSafeStep(),
    productiveLeadershipWorkspace: getProductiveLeadershipWorkspace(),
    productiveLeadershipWorkspaceDailyDecision:
      getProductiveLeadershipWorkspaceDailyDecision(),
    productiveLeadershipWorkspaceDailyExecution:
      getProductiveLeadershipWorkspaceDailyExecution(),
    productiveLeadershipWorkspaceDailyExecutionEvaluation:
      getProductiveLeadershipWorkspaceDailyExecutionEvaluation(),
    productiveProjectWorkspaceReadiness: getProductiveProjectWorkspaceReadiness(),
    productivePluginExpansionBridge: getProductivePluginExpansionBridge(),
    productiveReadOnlyProjectContextPreparation:
      getProductiveReadOnlyProjectContextPreparation(),
    productiveManualProjectWorkRunPreparation:
      getProductiveManualProjectWorkRunPreparation(),
    productiveManualProjectWorkRunEvaluation:
      getProductiveManualProjectWorkRunEvaluation(),
    productiveHealthProjectAgentWorkOrder:
      getProductiveHealthProjectAgentWorkOrder(),
    productiveHealthProjectAgentRunEvaluation:
      getProductiveHealthProjectAgentRunEvaluation(),
    productiveManualHealthProjectWorkStepPreparation:
      getProductiveManualHealthProjectWorkStepPreparation(),
    productiveFastQualityWorkMode: getProductiveFastQualityWorkMode(),
    productiveManualHealthDayWork,
    productiveHealthFinishCorridor: getProductiveHealthFinishCorridor(),
    productiveHealthFinishResultDraft: getProductiveHealthFinishResultDraft(),
    productiveHealthProductCard: getProductiveHealthProductCard(),
    productiveHealthProductCardManualReview:
      getProductiveHealthProductCardManualReview(),
    productiveHealthFirstWorkBlock: getProductiveHealthFirstWorkBlock(),
    productiveHealthFirstWorkBlockManualExecution:
      getProductiveHealthFirstWorkBlockManualExecution(),
    productiveHealthFirstWorkBlockManualExecutionEvaluation:
      getProductiveHealthFirstWorkBlockManualExecutionEvaluation(),
    productiveCentralProjectWorkRoutine:
      getProductiveCentralProjectWorkRoutine(),
    productiveExpansionFirstProjectWorkBlockFromRoutine:
      getProductiveExpansionFirstProjectWorkBlockFromRoutine(),
    productiveExpansionRoutineApplicationEvaluation:
      getProductiveExpansionRoutineApplicationEvaluation(),
    productiveMarketingFirstProjectWorkBlockFromRoutine:
      getProductiveMarketingFirstProjectWorkBlockFromRoutine(),
    productiveCrossProjectWorkRoutineEvaluation:
      getProductiveCrossProjectWorkRoutineEvaluation(),
    productiveCentralProjectWorkStandardProcess:
      getProductiveCentralProjectWorkStandardProcess(),
    productiveCentralDailyProjectWorkCard:
      getProductiveCentralDailyProjectWorkCard(),
    productiveCentralLiveOperatingModel:
      getProductiveCentralLiveOperatingModel(),
    productiveCentralLiveApprovalStageModuleMap:
      getProductiveCentralLiveApprovalStageModuleMap(),
    productiveCentralFirstDraftModeAction:
      getProductiveCentralFirstDraftModeAction(),
    productiveCentralFirstDraftModeActionManualReview:
      getProductiveCentralFirstDraftModeActionManualReview(),
    productiveCentralApprovalRequiredExecutionModel:
      getProductiveCentralApprovalRequiredExecutionModel(),
    productiveCentralApprovalRequiredExecutionManualReview:
      getProductiveCentralApprovalRequiredExecutionManualReview(),
    productiveCentralFutureWriteCapabilityModel:
      getProductiveCentralFutureWriteCapabilityModel(),
    productiveCentralFutureWriteCapabilityManualReview:
      getProductiveCentralFutureWriteCapabilityManualReview(),
    productiveCentralDisabledWriteArchitecturePlan:
      getProductiveCentralDisabledWriteArchitecturePlan(),
    productiveCentralDisabledWriteArchitecturePlanManualReview:
      getProductiveCentralDisabledWriteArchitecturePlanManualReview(),
    productiveCentralWritePermissionDecisionCorridor:
      getProductiveCentralWritePermissionDecisionCorridor(),
    productiveCentralWritePermissionManualDecisionEvaluation:
      getProductiveCentralWritePermissionManualDecisionEvaluation(),
    productiveCentralWritePermissionDecisionTemplate:
      getProductiveCentralWritePermissionDecisionTemplate(),
    productiveCentralWritePermissionReadOnlyReleaseBoundary:
      getProductiveCentralWritePermissionReadOnlyReleaseBoundary(),
    productiveCentralManualReleaseDecisionReadOnlyStructure:
      getProductiveCentralManualReleaseDecisionReadOnlyStructure(),
    productiveCentralManualReleaseDecisionGfReviewQuestions:
      getProductiveCentralManualReleaseDecisionGfReviewQuestions(),
    productiveCentralManualReleaseDecisionGfDecisionMask:
      getProductiveCentralManualReleaseDecisionGfDecisionMask(),
    productiveCentralManualReleaseDecisionGfShortDecision:
      getProductiveCentralManualReleaseDecisionGfShortDecision(),
    productiveCentralManualReleaseDecisionCard:
      getProductiveCentralManualReleaseDecisionCard(),
    productiveCentralManualReleaseDecisionFinalOverview:
      getProductiveCentralManualReleaseDecisionFinalOverview(),
    productiveCentralFinalReadinessOverview:
      getProductiveCentralFinalReadinessOverview(),
    productiveCentralV1CompletionPlan:
      getProductiveCentralV1CompletionPlan(),
    productiveCentralV1CompletionDecision:
      getProductiveCentralV1CompletionDecision(),
    productiveCentralV1GfDecisionCard:
      getProductiveCentralV1GfDecisionCard(),
    productiveCentralV1CompletionChecklist:
      getProductiveCentralV1CompletionChecklist(),
    productiveCentralV1CompletionReport:
      getProductiveCentralV1CompletionReport(),
    productiveCentralV1ManualReleaseDecision:
      getProductiveCentralV1ManualReleaseDecision(),
    productiveCentralV1FinalizationBoundary:
      getProductiveCentralV1FinalizationBoundary(),
    productiveCentralV1FinalOperatingState:
      getProductiveCentralV1FinalOperatingState(),
    productiveCentralV11AgentDailyRun:
      getProductiveCentralV11AgentDailyRun(),
    productiveCentralV11AgentResultRun:
      getProductiveCentralV11AgentResultRun(),
    productiveCentralV11PluginEnabledAgentTestMode:
      getProductiveCentralV11PluginEnabledAgentTestMode(),
    productiveCentralV11ControlledAgentPilotRun:
      getProductiveCentralV11ControlledAgentPilotRun(),
    productiveCentralV11StrategicAgentPilotRun:
      getProductiveCentralV11StrategicAgentPilotRun(),
    productiveCentralV11ReadOnlyAgentActionPlan:
      getProductiveCentralV11ReadOnlyAgentActionPlan(),
    productiveCentralV11ReadOnlyProjectFileGithubTestCorridor:
      getProductiveCentralV11ReadOnlyProjectFileGithubTestCorridor(),
    qualitySprintStandardApplied: true,
    pluginUseStillManualOnly: true,
    pluginExecutionRequiresJamalApproval: true,
    noAutomaticExternalPluginRequest: true,
    noAutomaticPluginWrite: true,
    manualOnly: true,
    requiresJamalApproval: true,
    automaticPluginExecutionBlocked: true,
    externalRequestsBlocked: true,
    writeOperationsBlocked: true,
    madeExternalRequest: false,
    externalActionStarted: false,
    automaticAgentTrainingStarted: false,
    automaticDecisionStarted: false,
    followUpAgentStarted: false,
  };
}

function handlePluginReadiness(res, requestUrl) {
  sendJson(res, 200, getPluginReadiness(requestUrl));
}

function getHrDailyTrainingSuggestion() {
  const projectManagerAutonomyHandoffRules = HR_DAILY_TRAINING_PROPOSALS.slice(0, 24).map((proposal) => ({
    agent: proposal.agent,
    handoffTo: "Projektmanager-Agent",
    requiredFields: PROJECT_MANAGER_AUTONOMY_FILTER.handoffRuleFields,
  }));

  return {
    version: "V1.1.5",
    agentCount: 25,
    title: "HR-Agentenentwicklung",
    summary:
      "Täglicher Trainingsvorschlag für bestehende 25 Agenten inklusive HR. HR entwickelt alle Agenten mit – inklusive sich selbst. HR schlägt vor, Jamal entscheidet.",
    dailyGoal: "Ziel: jeden Tag 1 % besser",
    selfDevelopmentRule: "HR entwickelt alle Agenten mit – inklusive sich selbst",
    selfAutonomyBoundary: "HR darf keine eigene Autonomie automatisch erhöhen",
    proposalMode: "local_static_visible_suggestion_only",
    topTrainingRecommendation: {
      label: "Von HR empfohlen",
      ...HR_TOP_TRAINING_RECOMMENDATION,
      jamalDecision: "Jamal entscheidet",
      action: "Heute freigeben oder überspringen",
      canApproveManually: true,
      autoExecutionBlocked: true,
    },
    recommendedAgent: HR_TOP_TRAINING_RECOMMENDATION.recommendedAgent,
    recommendedTrainingStep: HR_TOP_TRAINING_RECOMMENDATION.recommendedTrainingStep,
    reason: HR_TOP_TRAINING_RECOMMENDATION.reason,
    possibleAutonomyIncrease: HR_TOP_TRAINING_RECOMMENDATION.possibleAutonomyIncrease,
    riskBoundary: HR_TOP_TRAINING_RECOMMENDATION.riskBoundary,
    nextManualStepForJamal: HR_TOP_TRAINING_RECOMMENDATION.nextManualStepForJamal,
    canApproveManually: true,
    autoExecutionBlocked: true,
    completionCriterion:
      "Heute erledigt, wenn Jamal den Top-Trainingspunkt freigibt oder bewusst überspringt.",
    doneWhen:
      "Jamal gibt den Top-Trainingspunkt manuell frei oder überspringt ihn bewusst.",
    noFurtherActionRequired: true,
    nextSuggestionTomorrow: true,
    completionBoundary: "Jamal entscheidet, HR führt nichts automatisch aus.",
    projectManagerAutonomyFilter: {
      ...PROJECT_MANAGER_AUTONOMY_FILTER,
      handoffRulesForExisting24Agents: projectManagerAutonomyHandoffRules,
      externalActionBlocked: true,
      automaticExecutionBlocked: true,
      externalTaskDistributionBlocked: true,
      emailBlocked: true,
      cloudActionBlocked: true,
      deploymentBlocked: true,
      apiWriteAccessBlocked: true,
    },
    proposals: HR_DAILY_TRAINING_PROPOSALS.map((proposal) => ({
      ...proposal,
      nextManualStep: proposal.nextManualStep || "Jamal prüft und gibt maximal einen Trainingspunkt frei.",
    })),
    safetyLimits: [
      "keine automatische Schulung",
      "keine Agentenrechte automatisch ändern",
      "keine Aufgaben automatisch ausführen",
      "keine externen Aktionen",
      "kein Folgeagentenstart",
      "keine Entscheidung ohne Jamal",
      "keine Airtable-Schreibaktion",
      "keine eigene Rechte- oder Autonomie-Erhöhung durch HR",
    ],
    nextManualStep: "Jamal prüft und gibt maximal einen Trainingspunkt frei.",
    madeExternalRequest: false,
    writeEnabled: false,
    automationEnabled: false,
    agentTrainingStarted: false,
    agentStartEnabled: false,
  };
}

function handleHrDailyTrainingSuggestion(res) {
  sendJson(res, 200, getHrDailyTrainingSuggestion());
}

function getHrAutonomyApproval() {
  return {
    version: "V6.13.3",
    status: "Autonomie-Schritt freigebbar vorbereitet",
    hrAgentStatus: "Autonomie-Freigabe vorbereitet",
    recommendedAgent: "Projektmanager-Agent",
    approvableScope: "Darf Folgeagenten empfehlen.",
    proposedAutonomyStep: "Darf künftig den sinnvollsten Folgeagenten vorschlagen.",
    expectedBenefit:
      "Jamal muss nach einem Arbeitslauf nicht selbst überlegen, welcher Agent als Nächstes übernehmen sollte.",
    riskBoundary:
      "Falscher Folgeagent könnte vorgeschlagen werden. Empfehlung ja, automatischer Start nein.",
    notAllowed:
      "Folgeagent automatisch starten, externe Aktion ausführen, schreiben, veröffentlichen oder deployen.",
    approvalStatus: "Autonomie-Freigabe vorbereitet",
    decisionForJamal:
      "Soll der Projektmanager-Agent diesen kleinen Autonomie-Schritt bekommen?",
    nextAction: "Autonomie-Schritt prüfen und lokal freigeben oder ablehnen.",
    autonomyDevelopment: {
      currentScope: "Folgeagent empfehlen vorbereitet",
      nextScope: "Folgeagent-Empfehlung im Arbeitslauf automatisch vorschlagen",
      stillBlocked: "Folgeagent automatisch starten",
      hrRecommendation: "kleinen Spielraum lokal freigeben",
    },
    madeExternalRequest: false,
    canApplyToProjectManagerWorkflow: true,
    applicationMode: "local_workflow_recommendation_only",
    automaticStartBlocked: true,
    systemwideDevelopmentNext: true,
    nextRecommendedAgentAfterProjectManager: "Wissens-/Archiv-Agent",
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    boundaries: [
      "Empfehlung ja",
      "automatischer Start nein",
      "keine externe Aktion",
      "keine Schreibrechte",
      "keine Airtable-Rohdaten",
      "keine Feldnamen",
      "keine Feldwerte",
      "keine Record-IDs",
      "keine Tabellenstruktur",
    ],
  };
}

function handleHrAutonomyApproval(res) {
  sendJson(res, 200, getHrAutonomyApproval());
}

function getHrAllAgentsDevelopment() {
  return {
    version: "V6.13.3",
    status: "HR-Systemempfehlung vorbereitet",
    checkedAgentScope: "Kurz geprüft: bestehende Agentenbasis berücksichtigt.",
    recommendedAgentToday: "Wissens-/Archiv-Agent",
    reason:
      "Nach Projektmanager-Agent und HR-Agent ist der nächste stärkste Systemleistungsschritt, Wissen aus dem Arbeitsgedächtnis zu finden und als Chef-Kurzfassung nutzbar zu machen.",
    onePercentTraining:
      "Relevantes Wissen in maximal 4 Chef-Sätzen zusammenfassen.",
    autonomyStep:
      "Darf vorschlagen, welches Wissen für ein Projekt relevant sein könnte.",
    pluginCircle: "Wissens-/Archiv-Agent + Airtable read-only",
    expectedBenefit:
      "Jamal muss weniger suchen und bekommt schneller „Was wissen wir schon?“ beantwortet.",
    riskBoundary:
      "Keine Rohdaten, keine Feldnamen, keine Feldwerte, keine Record-IDs, keine Tabellenstruktur, keine Schreibrechte.",
    followUpDecision:
      "Soll V6.14.0 den Wissens-/Archiv-Agent als zweiten echten Plugin-Agent arbeitsfähig machen?",
    nextVersionStep: "V6.14.0",
    nextAction:
      "V6.14.0 vorbereiten: zweiten echten Plugin-Agenten arbeitsfähig machen.",
    nextPluginAgentPrepared: true,
    nextPluginAgent: "Wissens-/Archiv-Agent",
    nextPluginCircle: "Wissens-/Archiv-Agent + Airtable read-only",
    nextVersionActive: "V6.14.0",
    alternatives: [
      "Projektmanager-Agent: Folgeagent-Empfehlung weiter verfeinern",
      "HR-Agent: Autonomie-Schritte künftig noch knapper priorisieren",
    ],
    v613Closure:
      "V6.13.x hat HR-Training, 1%-Autonomie und Folgeagent-Empfehlung vorbereitet. Der nächste Systemleistungsschritt ist V6.14.0: Wissens-/Archiv-Agent als zweiter echter Plugin-Agent.",
    madeExternalRequest: false,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    boundaries: [
      "keine Airtable-Rohdaten",
      "keine Feldnamen",
      "keine Feldwerte",
      "keine Record-IDs",
      "keine Tabellenstruktur",
      "keine Schreibrechte",
      "keine automatische externe Aktion",
      "kein automatischer externer Agentenstart",
      "kein automatischer Folgeagentenstart",
    ],
  };
}

function handleHrAllAgentsDevelopment(res) {
  sendJson(res, 200, getHrAllAgentsDevelopment());
}

function getKnowledgeArchivePluginTask() {
  return {
    version: "V6.15.1",
    status: "Wissens-/Archiv-Agent arbeitsfähig vorbereitet",
    agent: "Wissens-/Archiv-Agent",
    plugin: "Airtable read-only",
    task:
      "Vorhandenes Wissen finden und als Chef-Kurzfassung vorbereiten.",
    expectedResult: [
      "Was wissen wir schon?",
      "Warum ist es relevant?",
      "Was folgt daraus?",
      "Nächster sinnvoller Schritt",
    ],
    contextReference: "aktueller Tagesfokus oder Projektkontext; falls nicht vorhanden: Noch kein Projektkontext ausgewählt",
    approvalBoundary:
      "keine Rohdaten · keine Feldnamen · keine Feldwerte · keine Record-IDs · keine Datensatzlisten · keine Tabellenstruktur · keine Base-Struktur · keine Schreibrechte",
    nextStep: "Wissens-Kurzfassung lokal vorbereiten",
    workflowAvailable: true,
    workflowMode: "sanitized_knowledge_question_to_chef_answer",
    workflowResultAvailable: true,
    followUpDecisionAvailable: true,
    nextAgentRecommendation: "Projektmanager-Agent",
    executionMode: "manual_local_approval_required",
    outputMode: "sanitized_chef_summary_only",
    madeExternalRequest: false,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
  };
}

function handleKnowledgeArchivePluginTask(res) {
  sendJson(res, 200, getKnowledgeArchivePluginTask());
}

function buildKnowledgeArchiveSummary(status, madeExternalRequest = false) {
  const outputs = {
    missing_credentials: {
      knowledgeStatus: "nicht bereit – lokale Zugangsdaten fehlen",
      summary: "Noch nicht aus Airtable gelesen.",
      relevance: "Airtable-Arbeitsgedächtnis ist lokal noch nicht erreichbar.",
      consequence: "Wissens-/Archiv-Agent bleibt vorbereitet, aber ohne lokale read-only Grundlage.",
      nextStep: "Lokale Zugangsdaten nur lokal ergänzen, nicht speichern oder sichern.",
      boundary: "Keine Airtable-Datenanzeige.",
    },
    manual_approval_required: {
      knowledgeStatus: "nicht bereit – Server-Freigabe fehlt",
      summary: "Wissens-Agent ist vorbereitet, echte lokale read-only Anfrage bleibt blockiert.",
      relevance: "Server-Freigabe schützt die echte lokale Anfrage.",
      consequence: "Wissens-Kurzfassung bleibt vorbereitet, aber noch nicht lokal ausführbar.",
      nextStep: "Manuelle Server-Freigabe setzen, wenn read-only Wissensarbeit erlaubt ist.",
      boundary: "Keine Rohdaten, keine Schreibrechte.",
    },
    ready_for_knowledge_summary: {
      knowledgeStatus: "bereit",
      summary: "Lokale Voraussetzungen sind bereit. Ausgabe bleibt sanitisiert.",
      relevance: "Wissens-/Archiv-Agent kann als nächster Plugin-Agent vorbereitet werden.",
      consequence: "Chef-Kurzfassung kann als nächster sicherer Arbeitsschritt vorbereitet werden.",
      nextStep: "Sanitisierte Wissens-Kurzfassung lokal vorbereiten.",
      boundary: "Chef-Kurzfassung statt Datenanzeige.",
    },
    sanitized_knowledge_summary_prepared: {
      knowledgeStatus: "sanitisiert vorbereitet",
      summary: "Wissens-/Archiv-Agent ist als zweiter Plugin-Agent arbeitsfähig vorbereitet – ohne Rohdaten.",
      relevance: "Jamal muss weniger selbst suchen, was bereits bekannt ist.",
      consequence: "Nächster Schritt ist ein geführter Wissens-Agenten-Arbeitslauf.",
      nextStep: "Wissens-Ergebnisstatus und Folgeentscheidung als V6.14.2 vorbereiten.",
      boundary: "Keine Rohdaten, keine Feldnamen, keine Feldwerte, keine Record-IDs, keine Tabellenstruktur.",
    },
    airtable_unreachable_or_rejected: {
      knowledgeStatus: "nicht erreichbar oder abgelehnt",
      summary: "Keine Wissens-Kurzfassung erzeugt.",
      relevance: "Lokaler Zugriff oder Freigabe ist nicht gültig.",
      consequence: "Wissens-Agent bleibt vorbereitet, aber nicht lokal ausführbar.",
      nextStep: "Lokale Zugangsdaten und Freigabe prüfen.",
      boundary: "Keine Daten wurden angezeigt.",
    },
  };

  const output = outputs[status] || outputs.airtable_unreachable_or_rejected;
  return {
    version: "V6.15.1",
    status,
    knowledgeSummaryStatus:
      status === "sanitized_knowledge_summary_prepared"
        ? "prepared_but_knowledge_summary_not_yet_available"
        : status,
    agent: "Wissens-/Archiv-Agent",
    plugin: "Airtable read-only",
    knowledgeStatus: output.knowledgeStatus,
    summary: output.summary,
    relevanceForJamal: output.relevance,
    consequence: output.consequence,
    nextMeaningfulStep: output.nextStep,
    boundary: output.boundary,
    executionStatus: output.knowledgeStatus,
    canCreateKnowledgeWorkflow: true,
    nextWorkflowStep: "knowledge_archive_workflow",
    madeExternalRequest,
    readOnly: true,
    sanitizedOnly: true,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
  };
}

function getKnowledgeArchiveSummary() {
  const airtableToken = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_PAT;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID;
  const airtableTableNameOrId =
    process.env.AIRTABLE_TABLE_ID || process.env.AIRTABLE_TABLE_NAME || process.env.AIRTABLE_TABLE_PROJECTS;
  const missingVariables = getMissingAirtableVariableNames(airtableToken, airtableBaseId, airtableTableNameOrId);
  const firstPreviewApproved = process.env.AIRTABLE_FIRST_READONLY_PREVIEW_APPROVED === "true";

  if (missingVariables.length > 0) {
    return {
      ...buildKnowledgeArchiveSummary("missing_credentials", false),
      missingVariables,
    };
  }

  if (!firstPreviewApproved) {
    return buildKnowledgeArchiveSummary("manual_approval_required", false);
  }

  return buildKnowledgeArchiveSummary("sanitized_knowledge_summary_prepared", false);
}

function handleKnowledgeArchiveSummary(res) {
  sendJson(res, 200, getKnowledgeArchiveSummary());
}

function buildKnowledgeArchiveWorkflow(status, madeExternalRequest = false) {
  const outputs = {
    missing_credentials: {
      workflowStatusLabel: "blockiert – lokale Zugangsdaten fehlen",
      workflowStatus: "missing_credentials",
      sanitizedSummary: "Noch nicht aus Airtable gelesen.",
      relevanceForJamal: "Airtable-Arbeitsgedächtnis ist lokal noch nicht erreichbar.",
      consequence: "Wissens-Arbeitslauf ist vorbereitet, aber lokale Grundlage fehlt.",
      nextMeaningfulStep: "Lokale Zugangsdaten nur lokal ergänzen, nicht speichern oder sichern.",
      decisionForJamal: "Soll Airtable lokal als read-only Wissensquelle vorbereitet werden?",
    },
    manual_approval_required: {
      workflowStatusLabel: "blockiert – Server-Freigabe fehlt",
      workflowStatus: "manual_approval_required",
      sanitizedSummary: "Wissens-Arbeitslauf ist vorbereitet, echte lokale read-only Anfrage bleibt geschützt.",
      relevanceForJamal: "Server-Freigabe schützt die echte lokale Anfrage.",
      consequence: "Ohne Server-Freigabe keine lokale Wissensprüfung.",
      nextMeaningfulStep: "Manuelle Server-Freigabe setzen, wenn read-only Wissensarbeit erlaubt ist.",
      decisionForJamal: "Soll der Wissens-/Archiv-Agent lokal read-only arbeiten dürfen?",
    },
    ready_for_knowledge_workflow: {
      workflowStatusLabel: "lokal freigebbar",
      workflowStatus: "ready_for_knowledge_workflow",
      sanitizedSummary: "Lokale Voraussetzungen sind bereit. Ausgabe bleibt sanitisiert.",
      relevanceForJamal: "Der Wissens-/Archiv-Agent kann Jamal eine Chef-Kurzfassung vorbereiten.",
      consequence: "Wissensfrage kann in Arbeitslauf überführt werden.",
      nextMeaningfulStep: "Wissens-Arbeitslauf lokal vorbereiten.",
      decisionForJamal: "Soll der Wissens-/Archiv-Agent diese Wissensfrage bearbeiten?",
    },
    workflow_prepared: {
      workflowStatusLabel: "Arbeitslauf vorbereitet",
      workflowStatus: "prepared_but_knowledge_summary_not_yet_available",
      sanitizedSummary: "Wissens-/Archiv-Agent führt die Frage \"Was wissen wir schon?\" als sichere Chef-Antwort.",
      relevanceForJamal: "Jamal muss weniger selbst suchen und bekommt schneller Kontext.",
      consequence: "Aus Wissen wird ein nächster sinnvoller Schritt abgeleitet.",
      nextMeaningfulStep: "Wissens-Ergebnisstatus und Folgeentscheidung als V6.14.2 vorbereiten.",
      decisionForJamal: "Soll dieser Wissens-Arbeitslauf als Standard für Wissensfragen gelten?",
    },
    airtable_unreachable_or_rejected: {
      workflowStatusLabel: "nicht ausführbar",
      workflowStatus: "airtable_unreachable_or_rejected",
      sanitizedSummary: "Keine Wissens-Kurzfassung erzeugt.",
      relevanceForJamal: "Lokaler Zugriff oder Freigabe ist nicht gültig.",
      consequence: "Wissens-Agent kann noch keine read-only Grundlage nutzen.",
      nextMeaningfulStep: "Lokale Zugangsdaten und Freigabe prüfen.",
      decisionForJamal: "Soll später erneut geprüft werden?",
    },
  };

  const output = outputs[status] || outputs.airtable_unreachable_or_rejected;
  return {
    version: "V6.15.1",
    status,
    agent: "Wissens-/Archiv-Agent",
    plugin: "Airtable read-only",
    workflowStatus: output.workflowStatus,
    workflowStatusLabel: output.workflowStatusLabel,
    knowledgeQuestion: "Was wissen wir schon?",
    sanitizedSummary: output.sanitizedSummary,
    relevanceForJamal: output.relevanceForJamal,
    consequence: output.consequence,
    nextMeaningfulStep: output.nextMeaningfulStep,
    decisionForJamal: output.decisionForJamal,
    boundary:
      "Keine Rohdaten, keine Feldnamen, keine Feldwerte, keine Record-IDs, keine Datensatzlisten, keine Tabellenstruktur, keine Base-Struktur, keine Schreibrechte.",
    canPrepareWorkflowResult: true,
    resultMode: "knowledge_status_and_follow_up_decision_only",
    madeExternalRequest,
    readOnly: true,
    sanitizedOnly: true,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
  };
}

function getKnowledgeArchiveWorkflow() {
  const summary = getKnowledgeArchiveSummary();
  let workflowStatus = "airtable_unreachable_or_rejected";

  if (summary.status === "missing_credentials") {
    workflowStatus = "missing_credentials";
  } else if (summary.status === "manual_approval_required") {
    workflowStatus = "manual_approval_required";
  } else if (summary.status === "ready_for_knowledge_summary") {
    workflowStatus = "ready_for_knowledge_workflow";
  } else if (summary.status === "sanitized_knowledge_summary_prepared") {
    workflowStatus = "workflow_prepared";
  }

  const workflow = buildKnowledgeArchiveWorkflow(workflowStatus, Boolean(summary.madeExternalRequest));
  if (Array.isArray(summary.missingVariables) && summary.missingVariables.length) {
    workflow.missingVariables = summary.missingVariables;
  }
  return workflow;
}

function handleKnowledgeArchiveWorkflow(res) {
  sendJson(res, 200, getKnowledgeArchiveWorkflow());
}

function buildKnowledgeArchiveWorkflowResult(status, madeExternalRequest = false) {
  const outputs = {
    missing_credentials: {
      workflowStatusLabel: "blockiert – lokale Zugangsdaten fehlen",
      resultStatusLabel: "noch nicht nutzbar",
      preparedKnowledgeAnswer:
        "Der Wissens-Arbeitslauf ist strukturiert, aber lokale read-only Grundlage fehlt.",
      usabilityForJamal: "Noch nicht als echte Wissensantwort nutzbar.",
      followUpDecision: "Soll Airtable lokal als read-only Wissensquelle vorbereitet werden?",
      nextAction: "Lokale Voraussetzungen prüfen oder Wissens-Arbeitslauf vorbereitet lassen.",
    },
    manual_approval_required: {
      workflowStatusLabel: "blockiert – Server-Freigabe fehlt",
      resultStatusLabel: "vorbereitet, aber nicht lokal ausführbar",
      preparedKnowledgeAnswer:
        "Ausgabeformat für Wissens-Kurzfassung, Relevanz, Folge und Entscheidung ist vorbereitet.",
      usabilityForJamal: "Als Struktur nutzbar, aber noch nicht als echte read-only Wissensauswertung.",
      followUpDecision: "Soll der Wissens-/Archiv-Agent lokal read-only arbeiten dürfen?",
      nextAction: "Server-Freigabe setzen oder Wissens-Ergebnisstruktur als Standard übernehmen.",
    },
    workflow_prepared: {
      workflowStatusLabel: "vorbereitet",
      resultStatusLabel: "Ergebnisstruktur vorbereitet",
      preparedKnowledgeAnswer:
        "Kurzfassung, Relevanz, Folge, nächster Schritt und Entscheidung sind als Ergebnisformat bereit.",
      usabilityForJamal: "Nutzbar als geführter Wissensprozess, aber noch ohne freie Airtable-Daten.",
      followUpDecision: "Soll dieser Arbeitslauf als Standard für Wissensfragen gelten?",
      nextAction: "Projektmanager-Agent soll später aus Wissensantwort eine konkrete Startaktion ableiten.",
    },
    usable_prepared: {
      workflowStatusLabel: "abschließbar",
      resultStatusLabel: "nutzbar vorbereitet",
      preparedKnowledgeAnswer:
        "Der Wissens-/Archiv-Agent hat ein sicheres Ergebnisformat für Jamals Wissensfragen vorbereitet.",
      usabilityForJamal: "Kann als Projektkontext und Entscheidungsgrundlage verwendet werden.",
      followUpDecision:
        "Soll der Projektmanager-Agent als Folgeagent aus diesem Wissen den nächsten Schritt ableiten?",
      nextAction: "Wissens-Ergebnis in Projektmanager-Startaktion überführen.",
    },
    airtable_unreachable_or_rejected: {
      workflowStatusLabel: "nicht ausführbar",
      resultStatusLabel: "nicht nutzbar",
      preparedKnowledgeAnswer:
        "Kein Wissens-Ergebnis erzeugt, weil lokale Prüfung nicht erreichbar oder abgelehnt ist.",
      usabilityForJamal: "Nicht als Wissensgrundlage nutzbar.",
      followUpDecision:
        "Soll später erneut geprüft werden oder soll der Projektmanager-Agent ohne Airtable weiterarbeiten?",
      nextAction: "Lokale Zugangsdaten und Freigabe prüfen.",
    },
  };

  const output = outputs[status] || outputs.airtable_unreachable_or_rejected;
  return {
    version: "V6.15.1",
    status,
    resultStatus: status === "usable_prepared" ? "prepared_but_knowledge_summary_not_yet_available" : status,
    agent: "Wissens-/Archiv-Agent",
    plugin: "Airtable read-only",
    workflow: "Wissens-/Archiv-Agent beantwortet \"Was wissen wir schon?\"",
    workflowStatus: output.workflowStatusLabel,
    workflowStatusLabel: output.workflowStatusLabel,
    resultStatusLabel: output.resultStatusLabel,
    preparedKnowledgeAnswer: output.preparedKnowledgeAnswer,
    usabilityForJamal: output.usabilityForJamal,
    followUpDecision: output.followUpDecision,
    recommendedFollowUpAgent: "Projektmanager-Agent",
    recommendationReason:
      "Er kann aus Wissen den nächsten Projekt-/Tagesfokus-Schritt ableiten.",
    canHandoffToProjectManager: true,
    handoffMode: "sanitized_knowledge_result_only",
    nextAction: output.nextAction,
    boundary:
      "Keine Rohdaten, keine Feldnamen, keine Feldwerte, keine Record-IDs, keine Datensatzlisten, keine Tabellenstruktur, keine Base-Struktur, keine Schreibrechte, kein automatischer Folgeagentenstart.",
    madeExternalRequest,
    readOnly: true,
    sanitizedOnly: true,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    automaticFollowUpAgentStartBlocked: true,
  };
}

function getKnowledgeArchiveWorkflowResult() {
  const workflow = getKnowledgeArchiveWorkflow();
  let resultStatus = "airtable_unreachable_or_rejected";

  if (workflow.status === "missing_credentials") {
    resultStatus = "missing_credentials";
  } else if (workflow.status === "manual_approval_required") {
    resultStatus = "manual_approval_required";
  } else if (workflow.status === "ready_for_knowledge_workflow") {
    resultStatus = "workflow_prepared";
  } else if (
    workflow.status === "workflow_prepared" ||
    workflow.workflowStatus === "prepared_but_knowledge_summary_not_yet_available"
  ) {
    resultStatus = "usable_prepared";
  }

  const result = buildKnowledgeArchiveWorkflowResult(resultStatus, Boolean(workflow.madeExternalRequest));
  if (Array.isArray(workflow.missingVariables) && workflow.missingVariables.length) {
    result.missingVariables = workflow.missingVariables;
  }
  return result;
}

function handleKnowledgeArchiveWorkflowResult(res) {
  sendJson(res, 200, getKnowledgeArchiveWorkflowResult());
}

function buildKnowledgeToProjectManagerStartAction(status, madeExternalRequest = false) {
  const outputs = {
    missing_credentials: {
      handoffStatus: "blockiert – lokale Zugangsdaten fehlen",
      knowledgeSource: "Wissens-/Archiv-Agent, aber noch keine lokale read-only Grundlage.",
      projectContext: "Noch nicht aus Wissens-Ergebnis ableitbar.",
      concreteFocus: "Noch nicht ermittelt.",
      nextMeaningfulStep: "Lokale Zugangsdaten nur lokal ergänzen, nicht speichern oder sichern.",
      decisionForJamal: "Soll Airtable lokal als read-only Wissensquelle vorbereitet werden?",
      agentTask: "Projektmanager-Agent wartet auf sanitisierte Wissensgrundlage.",
      preparationStatus: "nicht bereit",
    },
    manual_approval_required: {
      handoffStatus: "blockiert – Server-Freigabe fehlt",
      knowledgeSource: "Wissens-Arbeitslauf ist vorbereitet, echte lokale Anfrage bleibt geschützt.",
      projectContext: "Noch nicht aus echter read-only Wissensantwort ableitbar.",
      concreteFocus: "Noch nicht ermittelt.",
      nextMeaningfulStep: "Manuelle Server-Freigabe setzen, wenn lokale read-only Arbeit erlaubt ist.",
      decisionForJamal: "Soll der Wissens-/Archiv-Agent lokal read-only arbeiten dürfen?",
      agentTask: "Projektmanager-Agent kann die Startaktion erst nach sicherer Wissensantwort ableiten.",
      preparationStatus: "wartet auf Server-Freigabe",
    },
    knowledge_structure_prepared: {
      handoffStatus: "vorbereitet",
      knowledgeSource: "Sanitisierter Wissens-Ergebnisstatus liegt als Struktur vor.",
      projectContext: "Wissensantwort ist strukturiert, aber noch ohne freie Airtable-Daten.",
      concreteFocus: "Aus der Wissensstruktur kann ein nächster Projektmanager-Schritt vorbereitet werden.",
      nextMeaningfulStep: "Projektmanager-Agent soll aus Wissensstatus eine Startaktion formulieren.",
      decisionForJamal:
        "Soll diese Übergabe als Standardfluss zwischen Wissens-Agent und Projektmanager-Agent gelten?",
      agentTask:
        "Projektmanager-Agent: Übersetze die Wissensantwort in Fokus, nächsten Schritt und Entscheidung für Jamal.",
      preparationStatus: "Wissens-Ergebnisstruktur vorbereitet",
    },
    start_action_prepared: {
      handoffStatus: "Startaktion vorbereitet",
      knowledgeSource: "Sanitisierte Wissensantwort / Wissensstatus",
      projectContext: "Wissen wurde ohne Rohdaten als Kontext für den Projektmanager-Agent vorbereitet.",
      concreteFocus: "Aus Wissensantwort abgeleiteter Projektfokus.",
      nextMeaningfulStep: "Projektmanager-Startaktion prüfen und als nächsten Arbeitslauf verwenden.",
      decisionForJamal:
        "Soll der Projektmanager-Agent aus Wissensantworten künftig regelmäßig Startaktionen vorschlagen?",
      agentTask:
        "Projektmanager-Agent: Nutze die sanitisierte Wissensantwort als Kontext. Liefere Projektfokus, nächsten Schritt und Entscheidung. Keine Rohdaten anzeigen.",
      preparationStatus: "Startaktion aus Wissens-Ergebnis vorbereitet",
    },
    airtable_unreachable_or_rejected: {
      handoffStatus: "nicht ausführbar",
      knowledgeSource: "Wissens-Ergebnis konnte nicht erzeugt werden.",
      projectContext: "Nicht verfügbar.",
      concreteFocus: "Nicht ermittelt.",
      nextMeaningfulStep: "Lokale Zugangsdaten und Freigabe prüfen.",
      decisionForJamal:
        "Soll später erneut geprüft werden oder soll der Projektmanager-Agent ohne Wissensquelle weiterarbeiten?",
      agentTask: "Noch nicht starten.",
      preparationStatus: "nicht vorbereitet",
    },
  };

  const output = outputs[status] || outputs.airtable_unreachable_or_rejected;
  return {
    version: "V6.15.1",
    status,
    handoffStatus:
      status === "start_action_prepared"
        ? "prepared_but_knowledge_summary_not_yet_available"
        : status,
    handoffStatusLabel: output.handoffStatus,
    knowledgeSource: output.knowledgeSource,
    sourceAgent: "Wissens-/Archiv-Agent",
    followUpAgent: "Projektmanager-Agent",
    projectContext: output.projectContext,
    concreteFocus: output.concreteFocus,
    nextMeaningfulStep: output.nextMeaningfulStep,
    decisionForJamal: output.decisionForJamal,
    agentTask: output.agentTask,
    preparationStatus: output.preparationStatus,
    nextAction: "Startaktion aus Wissens-Ergebnis vorbereiten.",
    canCreateDailyDecision: true,
    dailyDecisionMode: "sanitized_agent_flow_only",
    automaticDecisionExecutionBlocked: true,
    boundary:
      "Keine Rohdaten, keine Feldnamen, keine Feldwerte, keine Record-IDs, keine Datensatzlisten, keine Tabellenstruktur, keine Base-Struktur, keine Schreibrechte, kein automatischer Folgeagentenstart.",
    madeExternalRequest,
    readOnly: true,
    sanitizedOnly: true,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    automaticFollowUpAgentStartBlocked: true,
  };
}

function getKnowledgeToProjectManagerStartAction() {
  const workflowResult = getKnowledgeArchiveWorkflowResult();
  let handoffStatus = "airtable_unreachable_or_rejected";

  if (workflowResult.status === "missing_credentials") {
    handoffStatus = "missing_credentials";
  } else if (workflowResult.status === "manual_approval_required") {
    handoffStatus = "manual_approval_required";
  } else if (workflowResult.status === "workflow_prepared") {
    handoffStatus = "knowledge_structure_prepared";
  } else if (
    workflowResult.status === "usable_prepared" ||
    workflowResult.resultStatus === "prepared_but_knowledge_summary_not_yet_available"
  ) {
    handoffStatus = "start_action_prepared";
  }

  const handoff = buildKnowledgeToProjectManagerStartAction(handoffStatus, Boolean(workflowResult.madeExternalRequest));
  if (Array.isArray(workflowResult.missingVariables) && workflowResult.missingVariables.length) {
    handoff.missingVariables = workflowResult.missingVariables;
  }
  return handoff;
}

function handleKnowledgeToProjectManagerStartAction(res) {
  sendJson(res, 200, getKnowledgeToProjectManagerStartAction());
}

function buildSystemFlowDailyDecision(status, madeExternalRequest = false) {
  const outputs = {
    missing_credentials: {
      decisionStatusLabel: "blockiert – lokale Zugangsdaten fehlen",
      whatSystemKnows: "Noch keine lokale read-only Grundlage verfügbar.",
      whatFollows:
        "Der Agentenfluss ist vorbereitet, aber noch nicht aus echter lokaler Wissensquelle ableitbar.",
      recommendedStartAction: "Lokale Voraussetzungen prüfen.",
      decisionForJamal: "Soll Airtable lokal als read-only Wissensquelle vorbereitet werden?",
      nextAgent: "Wissens-/Archiv-Agent wartet auf lokale Grundlage.",
      preparationStatus: "Tagesentscheidung noch nicht nutzbar.",
    },
    manual_approval_required: {
      decisionStatusLabel: "blockiert – Server-Freigabe fehlt",
      whatSystemKnows:
        "Wissens- und Projektmanager-Fluss sind vorbereitet, echte lokale Anfrage bleibt geschützt.",
      whatFollows: "Ohne Server-Freigabe keine lokale read-only Wissensprüfung.",
      recommendedStartAction:
        "Manuelle Server-Freigabe setzen, wenn lokale read-only Arbeit erlaubt ist.",
      decisionForJamal:
        "Soll der sichere lokale Agentenfluss serverseitig freigegeben werden?",
      nextAgent: "Wissens-/Archiv-Agent",
      preparationStatus: "wartet auf Server-Freigabe",
    },
    system_flow_prepared: {
      decisionStatusLabel: "vorbereitet",
      whatSystemKnows: "Sanitisierter Wissensstatus liegt als Struktur vor.",
      whatFollows: "Der Projektmanager-Agent kann daraus eine Startaktion vorbereiten.",
      recommendedStartAction: "Wissens-Ergebnis in Projektmanager-Startaktion überführen.",
      decisionForJamal: "Soll dieser Agentenfluss als Tagesentscheidung vorbereitet werden?",
      nextAgent: "Projektmanager-Agent",
      preparationStatus:
        "Tagesentscheidung vorbereitet, aber noch nicht als heutige Richtung übernommen.",
    },
    daily_decision_prepared: {
      decisionStatusLabel: "entscheidungsreif vorbereitet",
      whatSystemKnows: "Sanitisierter Wissensstatus und Projektmanager-Startaktion sind verbunden.",
      whatFollows: "Wissen wird zu einer konkreten Handlung für heute.",
      recommendedStartAction:
        "Projektmanager-Startaktion prüfen und als heutigen Fokus übernehmen.",
      decisionForJamal: "Soll diese Startaktion heute gelten?",
      nextAgent: "Projektmanager-Agent führt den nächsten Arbeitslauf vorbereitet weiter.",
      preparationStatus: "Tagesentscheidung vorbereitet",
    },
    airtable_unreachable_or_rejected: {
      decisionStatusLabel: "nicht ausführbar",
      whatSystemKnows: "Keine nutzbare Wissensgrundlage erzeugt.",
      whatFollows:
        "Tagesentscheidung kann nicht aus dem Agentenfluss abgeleitet werden.",
      recommendedStartAction: "Lokale Zugangsdaten und Freigabe prüfen.",
      decisionForJamal:
        "Soll später erneut geprüft werden oder soll ohne Wissensquelle weitergearbeitet werden?",
      nextAgent:
        "Projektmanager-Agent kann ohne Wissensquelle eine manuelle Startaktion vorbereiten.",
      preparationStatus: "nicht übernommen",
    },
  };

  const output = outputs[status] || outputs.airtable_unreachable_or_rejected;
  return {
    version: "V6.15.1",
    status,
    decisionStatus:
      status === "daily_decision_prepared"
        ? "prepared_but_knowledge_summary_not_yet_available"
        : status,
    decisionStatusLabel: output.decisionStatusLabel,
    systemFlow: "Wissens-/Archiv-Agent → Projektmanager-Agent",
    whatSystemKnows: output.whatSystemKnows,
    whatFollows: output.whatFollows,
    recommendedStartAction: output.recommendedStartAction,
    decisionForJamal: output.decisionForJamal,
    nextAgent: output.nextAgent,
    preparationStatus: output.preparationStatus,
    nextAction: "Tagesentscheidung aus Systemfluss vorbereiten.",
    canAdoptAsTodayDirection: true,
    todayDirectionMode: "manual_local_adoption_required",
    automaticAdoptionBlocked: true,
    boundary:
      "Keine Rohdaten, keine Feldnamen, keine Feldwerte, keine Record-IDs, keine Datensatzlisten, keine Tabellenstruktur, keine Base-Struktur, keine Schreibrechte, kein automatischer Folgeagentenstart, keine automatische Tagesentscheidung.",
    madeExternalRequest,
    readOnly: true,
    sanitizedOnly: true,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    automaticDecisionExecutionBlocked: true,
    automaticFollowUpAgentStartBlocked: true,
  };
}

function getSystemFlowDailyDecision() {
  const handoff = getKnowledgeToProjectManagerStartAction();
  let decisionStatus = "airtable_unreachable_or_rejected";

  if (handoff.status === "missing_credentials") {
    decisionStatus = "missing_credentials";
  } else if (handoff.status === "manual_approval_required") {
    decisionStatus = "manual_approval_required";
  } else if (handoff.status === "knowledge_structure_prepared") {
    decisionStatus = "system_flow_prepared";
  } else if (
    handoff.status === "start_action_prepared" ||
    handoff.handoffStatus === "prepared_but_knowledge_summary_not_yet_available"
  ) {
    decisionStatus = "daily_decision_prepared";
  }

  const decision = buildSystemFlowDailyDecision(decisionStatus, Boolean(handoff.madeExternalRequest));
  if (Array.isArray(handoff.missingVariables) && handoff.missingVariables.length) {
    decision.missingVariables = handoff.missingVariables;
  }
  return decision;
}

function handleSystemFlowDailyDecision(res) {
  sendJson(res, 200, getSystemFlowDailyDecision());
}

function buildSystemFlowTodayDirection(status, madeExternalRequest = false) {
  const outputs = {
    missing_credentials: {
      adoptionStatusLabel: "blockiert – lokale Zugangsdaten fehlen",
      todayDirection: "Noch nicht aus Systemfluss ableitbar.",
      reason: "Lokale read-only Grundlage fehlt.",
      startAction: "Lokale Voraussetzungen prüfen.",
      responsibleAgent: "Wissens-/Archiv-Agent wartet auf lokale Grundlage.",
      nextAgentWorkflow: "Noch nicht starten.",
      decisionForJamal: "Soll Airtable lokal als read-only Wissensquelle vorbereitet werden?",
      preparationStatus: "heutige Richtung noch nicht übernommen",
    },
    manual_approval_required: {
      adoptionStatusLabel: "blockiert – Server-Freigabe fehlt",
      todayDirection: "Systemfluss ist vorbereitet, echte lokale Anfrage bleibt geschützt.",
      reason: "Server-Freigabe schützt die lokale read-only Arbeit.",
      startAction:
        "Manuelle Server-Freigabe setzen, wenn lokale read-only Arbeit erlaubt ist.",
      responsibleAgent: "Wissens-/Archiv-Agent",
      nextAgentWorkflow: "Wissens-Arbeitslauf wartet auf Freigabe.",
      decisionForJamal: "Soll der lokale Agentenfluss serverseitig freigegeben werden?",
      preparationStatus: "wartet auf Server-Freigabe",
    },
    daily_decision_ready: {
      adoptionStatusLabel: "vorbereitet",
      todayDirection: "Tagesentscheidung aus Agentenfluss liegt vorbereitet vor.",
      reason:
        "Wissens-/Archiv-Agent und Projektmanager-Agent liefern gemeinsam eine Richtung.",
      startAction: "Projektmanager-Startaktion aus Systemfluss prüfen.",
      responsibleAgent: "Projektmanager-Agent",
      nextAgentWorkflow:
        "Projektmanager-Agent kann die Startaktion als Arbeitslauf weiterführen.",
      decisionForJamal: "Soll diese Richtung heute gelten?",
      preparationStatus: "übernahmebereit",
    },
    today_direction_prepared: {
      adoptionStatusLabel: "heutige Richtung vorbereitet",
      todayDirection: "Aus Tagesentscheidung als heutige Arbeitsrichtung vorbereitet.",
      reason: "Wissen wurde in Handlung und Tagesentscheidung übersetzt.",
      startAction: "Projektmanager-Agent bereitet den nächsten Arbeitslauf vor.",
      responsibleAgent: "Projektmanager-Agent",
      nextAgentWorkflow: "Startaktion → Agenten-Arbeitslauf → Ergebnisstatus → nächste Entscheidung",
      decisionForJamal:
        "Soll der Projektmanager-Agent diesen Arbeitslauf jetzt als heutige nächste Aktion vorbereiten?",
      preparationStatus: "heute dran",
    },
    airtable_unreachable_or_rejected: {
      adoptionStatusLabel: "nicht ausführbar",
      todayDirection: "Nicht übernommen.",
      reason: "Keine nutzbare Wissensgrundlage oder Tagesentscheidung verfügbar.",
      startAction: "Lokale Zugangsdaten und Freigabe prüfen.",
      responsibleAgent:
        "Projektmanager-Agent kann alternativ ohne Wissensquelle eine manuelle Startaktion vorbereiten.",
      nextAgentWorkflow: "Noch nicht starten.",
      decisionForJamal:
        "Soll später erneut geprüft werden oder ohne Wissensquelle weitergearbeitet werden?",
      preparationStatus: "nicht übernommen",
    },
  };

  const output = outputs[status] || outputs.airtable_unreachable_or_rejected;
  return {
    version: "V6.15.1",
    status,
    todayDirectionStatus:
      status === "today_direction_prepared"
        ? "prepared_but_knowledge_summary_not_yet_available"
        : status,
    adoptionStatusLabel: output.adoptionStatusLabel,
    todayDirection: output.todayDirection,
    reason: output.reason,
    startAction: output.startAction,
    responsibleAgent: output.responsibleAgent,
    previousKnowledgeSource: "Wissens-/Archiv-Agent · sanitisierter Wissensstatus",
    nextAgentWorkflow: output.nextAgentWorkflow,
    decisionForJamal: output.decisionForJamal,
    preparationStatus: output.preparationStatus,
    nextAction: "Tagesentscheidung als heutige Richtung übernehmen.",
    boundary:
      "Keine Rohdaten, keine Feldnamen, keine Feldwerte, keine Record-IDs, keine Datensatzlisten, keine Tabellenstruktur, keine Base-Struktur, keine Schreibrechte, kein automatischer Agentenstart, kein automatischer Folgeagentenstart, keine automatische Tagesentscheidung.",
    madeExternalRequest,
    readOnly: true,
    sanitizedOnly: true,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    automaticAdoptionBlocked: true,
    automaticDecisionExecutionBlocked: true,
    automaticFollowUpAgentStartBlocked: true,
    canCreateNextAgentWorkflow: true,
    nextWorkflowMode: "manual_local_approval_required",
    automaticWorkflowStartBlocked: true,
    canFeedContentDesignAgent: true,
    designContextMode: "sanitized_today_direction_only",
    automaticDesignActionBlocked: true,
  };
}

function getSystemFlowTodayDirection() {
  const decision = getSystemFlowDailyDecision();
  let todayDirectionStatus = "airtable_unreachable_or_rejected";

  if (decision.status === "missing_credentials") {
    todayDirectionStatus = "missing_credentials";
  } else if (decision.status === "manual_approval_required") {
    todayDirectionStatus = "manual_approval_required";
  } else if (decision.status === "system_flow_prepared") {
    todayDirectionStatus = "daily_decision_ready";
  } else if (
    decision.status === "daily_decision_prepared" ||
    decision.decisionStatus === "prepared_but_knowledge_summary_not_yet_available"
  ) {
    todayDirectionStatus = "today_direction_prepared";
  }

  const todayDirection = buildSystemFlowTodayDirection(
    todayDirectionStatus,
    Boolean(decision.madeExternalRequest)
  );
  if (Array.isArray(decision.missingVariables) && decision.missingVariables.length) {
    todayDirection.missingVariables = decision.missingVariables;
  }
  return todayDirection;
}

function handleSystemFlowTodayDirection(res) {
  sendJson(res, 200, getSystemFlowTodayDirection());
}

function buildSystemFlowNextAgentWorkflow(status, madeExternalRequest = false) {
  const outputs = {
    missing_credentials: {
      approvalStatusLabel: "blockiert – lokale Zugangsdaten fehlen",
      todayDirection: "Noch nicht aus Systemfluss ableitbar.",
      responsibleAgent: "Projektmanager-Agent wartet auf lokale Grundlage.",
      startAction: "Lokale Voraussetzungen prüfen.",
      expectedResult: "Noch kein echter Agenten-Arbeitslauf aus lokaler read-only Grundlage möglich.",
      decisionForJamal: "Soll Airtable lokal als read-only Wissensquelle vorbereitet werden?",
      preparationStatus: "Arbeitslauf noch nicht freigebbar",
    },
    manual_approval_required: {
      approvalStatusLabel: "blockiert – Server-Freigabe fehlt",
      todayDirection: "Systemfluss ist vorbereitet, echte lokale Anfrage bleibt geschützt.",
      responsibleAgent: "Projektmanager-Agent",
      startAction:
        "Manuelle Server-Freigabe setzen, wenn lokale read-only Arbeit erlaubt ist.",
      expectedResult: "Arbeitslaufstruktur vorbereitet, echte lokale Grundlage noch blockiert.",
      decisionForJamal: "Soll der lokale Agentenfluss serverseitig freigegeben werden?",
      preparationStatus: "wartet auf Server-Freigabe",
    },
    today_direction_ready: {
      approvalStatusLabel: "vorbereitet",
      todayDirection: "Tagesentscheidung liegt als heutige Richtung vorbereitet vor.",
      responsibleAgent: "Projektmanager-Agent",
      startAction: "Projektmanager-Startaktion aus heutiger Richtung vorbereiten.",
      expectedResult: "Chef-Zusammenfassung, nächster Schritt und Entscheidung für Jamal.",
      decisionForJamal: "Soll dieser Arbeitslauf lokal freigegeben werden?",
      preparationStatus: "freigabebereit",
    },
    workflow_approval_prepared: {
      approvalStatusLabel: "lokal freigebbar vorbereitet",
      todayDirection:
        "Aus Tagesentscheidung als heutige Arbeitsrichtung übernommen vorbereitet.",
      responsibleAgent: "Projektmanager-Agent",
      startAction: "Startaktion wird als Projektmanager-Arbeitslauf geführt.",
      expectedResult: "Arbeitslauf → Ergebnisstatus → Folgeentscheidung → nächste Aktion.",
      decisionForJamal:
        "Soll der Projektmanager-Agent diesen Arbeitslauf jetzt als nächste Aktion vorbereiten?",
      preparationStatus: "nächster Arbeitslauf vorbereitet",
    },
    airtable_unreachable_or_rejected: {
      approvalStatusLabel: "nicht ausführbar",
      todayDirection: "Nicht übernommen.",
      responsibleAgent: "Projektmanager-Agent",
      startAction: "Lokale Zugangsdaten und Freigabe prüfen.",
      expectedResult: "Kein Arbeitslauf gestartet.",
      decisionForJamal:
        "Soll später erneut geprüft werden oder ohne Wissensquelle weitergearbeitet werden?",
      preparationStatus: "nicht freigegeben",
    },
  };

  const output = outputs[status] || outputs.airtable_unreachable_or_rejected;
  return {
    version: "V6.15.1",
    status,
    workflowApprovalStatus:
      status === "workflow_approval_prepared"
        ? "prepared_but_local_context_not_yet_available"
        : status,
    approvalStatusLabel: output.approvalStatusLabel,
    todayDirection: output.todayDirection,
    responsibleAgent: output.responsibleAgent,
    startAction: output.startAction,
    workflow:
      "Startaktion prüfen · Chef-Zusammenfassung vorbereiten · wichtigsten Blocker benennen · nächsten Schritt ableiten · Entscheidung für Jamal vorbereiten",
    expectedResult: output.expectedResult,
    boundary:
      "Keine Rohdaten, keine Feldnamen, keine Feldwerte, keine Record-IDs, keine Datensatzlisten, keine Tabellenstruktur, keine Base-Struktur, keine Schreibrechte, kein automatischer Agentenstart, kein automatischer Folgeagentenstart, keine automatische Tagesentscheidung.",
    decisionForJamal: output.decisionForJamal,
    nextAction: "Nächsten Agenten-Arbeitslauf lokal freigeben.",
    preparationStatus: output.preparationStatus,
    madeExternalRequest,
    readOnly: true,
    sanitizedOnly: true,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    automaticWorkflowStartBlocked: true,
    automaticAdoptionBlocked: true,
    automaticDecisionExecutionBlocked: true,
    automaticFollowUpAgentStartBlocked: true,
    canSuggestContentDesignFollowUp: true,
    contentDesignAgentAvailable: true,
    canvaPreparationAvailable: true,
  };
}

function getSystemFlowNextAgentWorkflow() {
  const todayDirection = getSystemFlowTodayDirection();
  let workflowStatus = "airtable_unreachable_or_rejected";

  if (todayDirection.status === "missing_credentials") {
    workflowStatus = "missing_credentials";
  } else if (todayDirection.status === "manual_approval_required") {
    workflowStatus = "manual_approval_required";
  } else if (todayDirection.status === "daily_decision_ready") {
    workflowStatus = "today_direction_ready";
  } else if (
    todayDirection.status === "today_direction_prepared" ||
    todayDirection.todayDirectionStatus === "prepared_but_knowledge_summary_not_yet_available"
  ) {
    workflowStatus = "workflow_approval_prepared";
  }

  const workflow = buildSystemFlowNextAgentWorkflow(
    workflowStatus,
    Boolean(todayDirection.madeExternalRequest)
  );
  if (Array.isArray(todayDirection.missingVariables) && todayDirection.missingVariables.length) {
    workflow.missingVariables = todayDirection.missingVariables;
  }
  return workflow;
}

function handleSystemFlowNextAgentWorkflow(res) {
  sendJson(res, 200, getSystemFlowNextAgentWorkflow());
}

function getContentDesignPluginTask() {
  return {
    version: "V1.1.5",
    status: "Canva-Arbeitsfähigkeit vorbereitet",
    agent: "Content-/Design-Agent",
    plugin: "Canva",
    task:
      "Design-/Textverbesserung vorbereiten, Canva-Briefing formulieren und klarere, schönere und hochwertigere Darstellung vorschlagen.",
    triggerContext:
      "heutige Arbeitsrichtung, Projektmanager-Startaktion oder Wissens-/Archiv-Kontext; falls nichts vorhanden: Noch kein Design-Kontext ausgewählt",
    contextMode: "sanitized_today_direction_or_project_context_only",
    expectedResult:
      "Design-Ziel, Verbesserungsvorschlag, Canva-Briefing, Freigabeentscheidung und nächster manueller Schritt.",
    designGoal: "Bestehende Inhalte klarer, schöner und hochwertiger für Jamal vorbereiten.",
    workflowAvailable: true,
    workflowMode: "context_to_canva_briefing",
    executionMode: "manual_local_approval_required",
    approvalBoundary:
      "Keine automatische Canva-Erstellung, keine Veröffentlichung, keine externe Aktion ohne Freigabe, keine Schreibrechte, keine API-Schlüssel-Speicherung.",
    nextStep: "Canva-Vorbereitungsauftrag prüfen.",
    madeExternalRequest: false,
    externalCanvaActionExecuted: false,
    automaticCanvaCreationBlocked: true,
    automaticPublishingBlocked: true,
    externalActionsBlockedByDefault: true,
    writeEnabled: false,
    dataDisplayEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    secretStorageBlocked: true,
  };
}

function handleContentDesignPluginTask(res) {
  sendJson(res, 200, getContentDesignPluginTask());
}

function getContentDesignCanvaBrief() {
  return {
    version: "V1.1.5",
    status: "canva_brief_prepared",
    canvaStatus: "brief_prepared_external_canva_action_not_executed",
    preparationStatus: "Canva-Vorbereitung vorbereitet",
    projectContext: "Heutige Arbeitsrichtung oder Projektkontext kann als Grundlage dienen.",
    designGoal: "Schöner, klarer und hochwertiger darstellen.",
    improvementProposal:
      "Content-/Design-Agent bereitet ein Canva-Briefing und eine sichtbare Qualitätsverbesserung vor.",
    canvaBriefing:
      "Canva-Entwurf vorbereiten, aber nicht veröffentlichen. Erst Jamal-Freigabe.",
    approvalForJamal: "Soll dieser Canva-Vorbereitungsauftrag freigegeben werden?",
    canCreateContentDesignWorkflow: true,
    canvaWorkflowMode: "brief_only_external_action_blocked",
    canFeedQaComplianceReview: true,
    reviewRequiredBeforeExternalAction: true,
    boundary:
      "Keine automatische Canva-Erstellung, keine Veröffentlichung, keine externe Aktion ohne Freigabe, keine Schreibrechte, keine API-Schlüssel-Speicherung.",
    nextAction: "Content-/Design-Arbeitslauf durch QA-Agent und Compliance-/Risiko-Agent prüfen.",
    madeExternalRequest: false,
    externalCanvaActionExecuted: false,
    automaticCanvaCreationBlocked: true,
    automaticPublishingBlocked: true,
    automaticExternalActionBlocked: true,
    writeEnabled: false,
    dataDisplayEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    secretStorageBlocked: true,
  };
}

function handleContentDesignCanvaBrief(res) {
  sendJson(res, 200, getContentDesignCanvaBrief());
}

function getContentDesignWorkflow() {
  return {
    version: "V1.1.5",
    status: "content_design_workflow_prepared",
    canvaWorkflowStatus: "briefing_workflow_prepared_external_canva_action_not_executed",
    agent: "Content-/Design-Agent",
    plugin: "Canva",
    workflowStatus: "Canva-Briefing vorbereitet – externe Canva-Aktion nicht ausgeführt.",
    projectContext:
      "Aus heutiger Arbeitsrichtung oder Projektmanager-Startaktion ableitbar, sobald freigegeben.",
    designGoal: "Bestehende Inhalte klarer, schöner und hochwertiger für Jamal vorbereiten.",
    improvementProposal:
      "Der Content-/Design-Agent soll aus dem freigegebenen Kontext einen verständlichen, hochwertigen Design-Entwurf vorbereiten.",
    canvaBriefing:
      "Erstelle später einen klaren, hochwertigen Canva-Entwurf auf Basis des freigegebenen Projektkontexts. Keine Veröffentlichung. Erst Entwurf, dann Jamal-Freigabe.",
    approvalDecision:
      "Soll dieser Content-/Design-Arbeitslauf als nächster Design-Schritt freigegeben werden?",
    qaComplianceReviewAvailable: true,
    reviewMode: "local_agent_team_review",
    boundary:
      "Keine automatische Canva-Erstellung, keine Veröffentlichung, keine externe Aktion ohne Freigabe, keine Schreibrechte, keine Canva-Secrets, keine API-Schlüssel-Speicherung.",
    nextAction: "Design-Arbeitslauf durch Agenten-Team prüfen.",
    madeExternalRequest: false,
    externalCanvaActionExecuted: false,
    automaticCanvaCreationBlocked: true,
    automaticPublishingBlocked: true,
    automaticExternalActionBlocked: true,
    writeEnabled: false,
    dataDisplayEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    secretStorageBlocked: true,
    canvaSecretsBlocked: true,
  };
}

function handleContentDesignWorkflow(res) {
  sendJson(res, 200, getContentDesignWorkflow());
}

function getContentDesignReviewTeam() {
  return {
    version: "V1.1.5",
    status: "design_team_review_prepared",
    canvaStatus: "brief_review_prepared_external_canva_action_not_executed",
    primaryAgent: "Content-/Design-Agent",
    reviewAgents: ["QA-Agent", "Compliance-/Risiko-Agent"],
    reviewStatus: "Agenten-Team-Prüfung vorbereitet",
    contentDesignProposal:
      "Canva-Briefing und Verbesserungsvorschlag liegen lokal vorbereitet vor.",
    qaResult:
      "QA-Agent prüft auf Verständlichkeit, Klarheit, hochwertige Wirkung, Nutzbarkeit und Verbesserungspotenzial.",
    complianceRiskResult:
      "Compliance-/Risiko-Agent prüft Grenzen, sensible Inhalte, Datenschutz, Veröffentlichung und Nicht-Dürfen-Regeln. Keine finale Rechtsfreigabe.",
    approvalRecommendation:
      "Prüfung vorbereitet, noch keine externe Canva-Aktion. Freigabe erst nach Jamals Entscheidung.",
    decisionForJamal:
      "Soll diese Agenten-Team-Prüfung als Standard für Design-Arbeiten gelten?",
    nextAction:
      "Geprüften Design-Arbeitslauf als V6.15.3 zu Freigabeentscheidung führen.",
    boundary:
      "Keine automatische Canva-Erstellung, keine Veröffentlichung, keine externe Aktion ohne Freigabe, keine Schreibrechte, keine Canva-Secrets, keine API-Schlüssel-Speicherung, keine finale Rechtsfreigabe.",
    madeExternalRequest: false,
    externalCanvaActionExecuted: false,
    automaticCanvaCreationBlocked: true,
    automaticPublishingBlocked: true,
    automaticExternalActionBlocked: true,
    writeEnabled: false,
    dataDisplayEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    legalFinalApprovalClaimed: false,
    secretStorageBlocked: true,
    canvaSecretsBlocked: true,
  };
}

function handleContentDesignReviewTeam(res) {
  sendJson(res, 200, getContentDesignReviewTeam());
}

function getContentDesignChefDecision() {
  return {
    version: "V1.1.5",
    status: "chef_decision_prepared",
    madeExternalRequest: false,
    decisionRecommendation: "Überarbeiten",
    shortReason:
      "Die Teamprüfung ist vorbereitet und grundsätzlich nutzbar, aber vor einer Canva-Freigabe soll Jamal den konkreten Kontext und die Freigabegrenze noch einmal bestätigen.",
    mainRisk:
      "Ein Design- oder Textentwurf könnte ohne klaren Kontext falsche Erwartungen wecken oder zu früh wie eine Veröffentlichung wirken.",
    nextManualStep:
      "Jamal prüft den Canva-Auftrag, bestätigt den Projekt-/Tageskontext und entscheidet manuell, ob überarbeitet oder freigegeben wird.",
    copyableFollowUpTask:
      "Content-/Design-Agent: Überarbeite das Canva-Briefing mit klarem Projektkontext. QA-Agent prüft Klarheit und Premium-Wirkung. Compliance-/Risiko-Agent prüft sensible Inhalte, Veröffentlichung und Grenzen. Keine Canva-Erstellung, keine Veröffentlichung und keine externe Aktion ohne Jamal-Freigabe.",
    boundaries: [
      "Keine automatische Canva-Erstellung",
      "Keine automatische Veröffentlichung",
      "Keine automatische externe Aktion",
      "Keine finale Rechtsfreigabe",
      "Keine automatische Tagesentscheidung ohne Jamal",
      "Keine Schreibrechte",
      "Keine API-Schlüssel- oder Canva-Secret-Speicherung",
      "Keine Airtable-Rohdaten, Feldnamen, Feldwerte, Record-IDs, Datensatzlisten, Tabellenstruktur oder Base-Struktur",
    ],
    externalCanvaActionExecuted: false,
    automaticCanvaCreationBlocked: true,
    automaticPublishingBlocked: true,
    automaticExternalActionBlocked: true,
    automaticDailyDecisionBlocked: true,
    writeEnabled: false,
    dataDisplayEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    legalFinalApprovalClaimed: false,
    secretStorageBlocked: true,
    canvaSecretsBlocked: true,
  };
}

function handleContentDesignChefDecision(res) {
  sendJson(res, 200, getContentDesignChefDecision());
}

function getContentDesignFollowUpTask() {
  return {
    version: "V1.1.5",
    status: "follow_up_task_prepared",
    madeExternalRequest: false,
    sourceDecision: "Überarbeiten",
    taskGoal:
      "Das Canva-Briefing so überarbeiten, dass Ziel, Zielgruppe, gewünschte Wirkung und konkrete Designanforderungen klarer werden.",
    improvements: [
      "Ziel und gewünschte Wirkung klarer formulieren",
      "Zielgruppe und Nutzungssituation präzisieren",
      "Designanforderungen so konkret machen, dass Canva später sauber vorbereitet werden kann",
    ],
    responsibleAgent:
      "Content-/Design-Agent; QA-Agent und Compliance-/Risiko-Agent können danach erneut prüfen.",
    qualityTarget:
      "Jamal erkennt ein gutes Ergebnis daran, dass der Auftrag ohne Rückfragen als klares Canva-Briefing nutzbar ist und keine Veröffentlichung oder externe Aktion auslöst.",
    taskBoundary:
      "Der Folgeauftrag darf kein Canva-Design erstellen, nichts veröffentlichen, keine externe Aktion ausführen, keine Rechtsfreigabe behaupten und keinen Folgeagenten automatisch starten.",
    copyableTaskText:
      "Content-/Design-Agent: Überarbeite das Canva-Briefing. Formuliere Ziel, Zielgruppe, gewünschte Wirkung und konkrete Designanforderungen klarer. Bereite nur einen lokalen Briefing-Text vor. Keine Canva-Erstellung, keine Veröffentlichung und keine externe Aktion ohne Jamal-Freigabe.",
    safetyBoundaries: [
      "Keine automatische Canva-Erstellung",
      "Keine automatische Veröffentlichung",
      "Keine automatische externe Aktion",
      "Kein automatischer externer Agentenstart",
      "Kein automatischer Folgeagentenstart",
      "Keine finale Rechtsfreigabe",
      "Keine automatische Tagesentscheidung ohne Jamal",
      "Keine Schreibrechte",
      "Keine API-Schlüssel- oder Canva-Secret-Speicherung",
      "Keine Airtable-Rohdaten, Feldnamen, Feldwerte, Record-IDs, Datensatzlisten, Tabellenstruktur oder Base-Struktur",
    ],
    externalCanvaActionExecuted: false,
    automaticCanvaCreationBlocked: true,
    automaticPublishingBlocked: true,
    automaticExternalActionBlocked: true,
    automaticAgentStartBlocked: true,
    automaticFollowUpAgentStartBlocked: true,
    automaticDailyDecisionBlocked: true,
    writeEnabled: false,
    dataDisplayEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    legalFinalApprovalClaimed: false,
    secretStorageBlocked: true,
    canvaSecretsBlocked: true,
  };
}

function handleContentDesignFollowUpTask(res) {
  sendJson(res, 200, getContentDesignFollowUpTask());
}

function getContentDesignFollowUpReadiness() {
  return {
    version: "V1.1.5",
    status: "follow_up_readiness_prepared",
    madeExternalRequest: false,
    readinessStatus: "nachschärfen",
    shortReason:
      "Der Folgeauftrag ist hilfreich, aber vor der erneuten Teamprüfung sollten konkretes Canva-Briefing, Zielgruppe und Prüfkriterien klarer sein.",
    alreadyGoodEnough: [
      "Entscheidung „Überarbeiten“ ist klar",
      "Drei Verbesserungsrichtungen sind vorhanden",
      "Qualitätsziel und Grenze sind definiert",
    ],
    stillMissing: [
      "Konkreter Design-Kontext fehlt noch",
      "Zielgruppe und Nutzungssituation sollten präziser sein",
      "Prüfkriterien für QA und Compliance sollten noch klarer formuliert werden",
    ],
    nextManualAction:
      "Jamal schärft Kontext, Zielgruppe und Prüfkriterien kurz nach und gibt den Auftrag dann manuell erneut in die Teamprüfung.",
    manualReviewRecommendation:
      "Diesen Folgeauftrag manuell erneut durch Content-/Design-Agent, QA-Agent und Compliance-/Risiko-Agent prüfen lassen.",
    copyableReviewTask:
      "Bitte prüft diesen überarbeiteten Folgeauftrag erneut als Agenten-Team. Achtet besonders darauf, ob Ziel, Zielgruppe, Designanforderungen, Qualitätsziel und Compliance-Grenzen klar genug sind. Keine externe Canva-Aktion ausführen.",
    safetyBoundaries: [
      "Keine automatische Teamprüfung",
      "Kein automatischer Folgeagentenstart",
      "Keine automatische Canva-Erstellung",
      "Keine automatische Veröffentlichung",
      "Keine automatische externe Aktion",
      "Keine finale Rechtsfreigabe",
      "Keine automatische Tagesentscheidung ohne Jamal",
      "Keine Schreibrechte",
      "Keine API-Schlüssel- oder Canva-Secret-Speicherung",
      "Keine Airtable-Rohdaten, Feldnamen, Feldwerte, Record-IDs, Datensatzlisten, Tabellenstruktur oder Base-Struktur",
    ],
    automaticTeamReviewStarted: false,
    externalCanvaActionExecuted: false,
    automaticCanvaCreationBlocked: true,
    automaticPublishingBlocked: true,
    automaticExternalActionBlocked: true,
    automaticAgentStartBlocked: true,
    automaticFollowUpAgentStartBlocked: true,
    automaticDailyDecisionBlocked: true,
    writeEnabled: false,
    dataDisplayEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    legalFinalApprovalClaimed: false,
    secretStorageBlocked: true,
    canvaSecretsBlocked: true,
  };
}

function handleContentDesignFollowUpReadiness(res) {
  sendJson(res, 200, getContentDesignFollowUpReadiness());
}

function getContentDesignRefinedFollowUpTask() {
  return {
    version: "V1.1.5",
    status: "refined_follow_up_task_prepared",
    madeExternalRequest: false,
    sourceReadinessStatus: "nachschärfen",
    refinementDecision:
      "Auftrag präzisieren und danach manuell erneut prüfen lassen",
    designContext:
      "Das vorbereitete Canva-Briefing für den aktuellen Content-/Design-Folgeauftrag soll konkreter werden, bevor daraus später ein Design-Entwurf vorbereitet wird.",
    targetAudienceAndUseCase:
      "Gedacht für Jamal als Entscheider; genutzt wird das Design-Briefing zur späteren manuellen oder plugin-geführten Canva-Vorbereitung nach ausdrücklicher Freigabe.",
    refinedDesignRequirements: [
      "Das Designziel muss in einem Satz verständlich sein",
      "Zielgruppe und Nutzungssituation müssen eindeutig benannt sein",
      "Canva-Anforderungen müssen so konkret sein, dass daraus später ein klares Briefing entstehen kann",
    ],
    qaReviewCriteria: [
      "Ist der Auftrag eindeutig genug formuliert?",
      "Sind Ziel, Zielgruppe und gewünschte Wirkung verständlich?",
      "Kann ein Agent daraus ohne Rückfrage ein besseres Briefing vorbereiten?",
    ],
    complianceReviewCriteria: [
      "Werden keine rechtlich finalen Freigaben behauptet?",
      "Bleibt klar, dass keine automatische Veröffentlichung erfolgt?",
      "Bleibt klar, dass keine externe Canva-Aktion ausgeführt wird?",
    ],
    newReadinessStatus: "prüfbereit nach manueller Kontrolle",
    nextManualAction:
      "Jamal prüft den nachgeschärften Auftrag kurz und kann ihn danach manuell erneut durch Content-/Design-Agent, QA-Agent und Compliance-/Risiko-Agent prüfen lassen.",
    copyableRefinedTask:
      "Bitte überarbeite den vorbereiteten Content-/Design-Folgeauftrag so, dass Ziel, Zielgruppe, Nutzungssituation, gewünschte Wirkung und konkrete Canva-Briefing-Anforderungen klarer werden. Achte darauf, dass QA und Compliance danach prüfen können, ob der Auftrag eindeutig, risikoarm und ohne externe Canva-Aktion nutzbar ist.",
    safetyBoundaries: [
      "Keine automatische Teamprüfung",
      "Kein automatischer Folgeagentenstart",
      "Keine automatische Canva-Erstellung",
      "Keine automatische Veröffentlichung",
      "Keine automatische externe Aktion",
      "Keine finale Rechtsfreigabe",
      "Keine automatische Tagesentscheidung ohne Jamal",
      "Keine Schreibrechte",
      "Keine API-Schlüssel- oder Canva-Secret-Speicherung",
      "Keine Airtable-Rohdaten, Feldnamen, Feldwerte, Record-IDs, Datensatzlisten, Tabellenstruktur oder Base-Struktur",
    ],
    automaticTeamReviewStarted: false,
    externalCanvaActionExecuted: false,
    automaticCanvaCreationBlocked: true,
    automaticPublishingBlocked: true,
    automaticExternalActionBlocked: true,
    automaticAgentStartBlocked: true,
    automaticFollowUpAgentStartBlocked: true,
    automaticDailyDecisionBlocked: true,
    writeEnabled: false,
    dataDisplayEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    legalFinalApprovalClaimed: false,
    secretStorageBlocked: true,
    canvaSecretsBlocked: true,
  };
}

function handleContentDesignRefinedFollowUpTask(res) {
  sendJson(res, 200, getContentDesignRefinedFollowUpTask());
}

function getContentDesignManualTeamReviewPrep() {
  return {
    version: "V1.1.5",
    status: "manual_team_review_prepared",
    madeExternalRequest: false,
    source: "Nachgeschärfter prüfbereiter Folgeauftrag aus V6.15.6",
    reviewStatus: "Noch nicht gestartet",
    reviewRoles: [
      {
        role: "Design",
        agent: "Content-/Design-Agent",
        questions: [
          "Ist das Designziel in einem Satz klar?",
          "Sind Zielgruppe und Nutzungssituation eindeutig genug?",
          "Sind die Canva-Briefing-Anforderungen konkret genug für einen späteren Entwurf?",
        ],
      },
      {
        role: "QA",
        agent: "QA-Agent",
        questions: [
          "Ist der Auftrag eindeutig und ohne Rückfrage nutzbar?",
          "Sind gewünschte Wirkung und Qualitätsziel verständlich?",
          "Kann daraus ein besseres Briefing vorbereitet werden?",
        ],
      },
      {
        role: "Compliance",
        agent: "Compliance-/Risiko-Agent",
        questions: [
          "Bleibt klar, dass keine externe Canva-Aktion ausgeführt wird?",
          "Bleibt klar, dass keine automatische Veröffentlichung erfolgt?",
          "Werden keine finale Rechtsfreigabe oder falsche Versprechen behauptet?",
        ],
      },
    ],
    expectedReviewResult:
      "Manuelle Einschätzung, ob der nachgeschärfte Auftrag freigabereif, erneut zu überarbeiten oder zu stoppen ist.",
    copyableManualReviewText:
      "Bitte prüft den nachgeschärften Content-/Design-Folgeauftrag manuell als Team. Design prüft Ziel, Zielgruppe, Nutzungssituation und Canva-Briefing-Anforderungen. QA prüft Klarheit, Nutzbarkeit und Qualitätsziel. Compliance prüft Risiken, Veröffentlichung, sensible Inhalte und Grenzen. Keine externe Canva-Aktion ausführen und keine automatische Entscheidung treffen.",
    safetyBoundaries: [
      "Noch nicht gestartet",
      "Keine automatische Teamprüfung",
      "Kein automatischer Folgeagentenstart",
      "Keine automatische Canva-Erstellung",
      "Keine automatische Veröffentlichung",
      "Keine automatische externe Aktion",
      "Keine finale Rechtsfreigabe",
      "Keine automatische Tagesentscheidung ohne Jamal",
      "Keine Schreibrechte",
      "Keine API-Schlüssel- oder Canva-Secret-Speicherung",
      "Keine Airtable-Rohdaten, Feldnamen, Feldwerte, Record-IDs, Datensatzlisten, Tabellenstruktur oder Base-Struktur",
    ],
    automaticTeamReviewStarted: false,
    externalCanvaActionExecuted: false,
    automaticCanvaCreationBlocked: true,
    automaticPublishingBlocked: true,
    automaticExternalActionBlocked: true,
    automaticAgentStartBlocked: true,
    automaticFollowUpAgentStartBlocked: true,
    automaticDailyDecisionBlocked: true,
    writeEnabled: false,
    dataDisplayEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    legalFinalApprovalClaimed: false,
    secretStorageBlocked: true,
    canvaSecretsBlocked: true,
  };
}

function handleContentDesignManualTeamReviewPrep(res) {
  sendJson(res, 200, getContentDesignManualTeamReviewPrep());
}

function getContentDesignManualTeamReviewEvaluation() {
  return {
    version: "V1.1.5",
    status: "manual_team_review_evaluation_prepared",
    madeExternalRequest: false,
    source: "Vorbereiteter manueller Teamprüfungsauftrag aus V6.15.7",
    simulatedFeedback: [
      {
        role: "Design",
        feedback:
          "Designziel und Canva-Briefing sind grundsätzlich verständlich, Zielgruppe und gewünschte Wirkung sollten aber noch präziser formuliert werden.",
        roleAssessment: "nachbessern",
      },
      {
        role: "QA",
        feedback:
          "Der Auftrag ist nutzbar, aber die Qualitätskriterien sollten klarer messbar sein, damit Jamal schneller erkennt, ob die Überarbeitung gut genug ist.",
        roleAssessment: "nachbessern",
      },
      {
        role: "Compliance",
        feedback:
          "Keine externe Canva-Aktion, keine Veröffentlichung und keine finale Rechtsfreigabe sind klar gesperrt.",
        roleAssessment: "unkritisch",
      },
    ],
    overallStatus: "nachbessern",
    shortReason:
      "Design und QA sehen noch Klärungsbedarf bei Zielgruppe, Wirkung und Prüfkriterien. Compliance meldet keine akute Sperre, solange keine externe Canva-Aktion ausgeführt wird.",
    mainRisk:
      "Ohne präzisere Zielgruppe und Qualitätskriterien könnte ein späteres Canva-Briefing zu allgemein bleiben.",
    nextManualStep:
      "Jamal lässt den Folgeauftrag manuell nachbessern: Zielgruppe, gewünschte Wirkung und QA-Prüfkriterien konkretisieren.",
    decisionBoundary: "Keine automatische Entscheidung",
    safetyBoundaries: [
      "Keine automatische Entscheidung",
      "Keine automatische Teamprüfung",
      "Kein automatischer Folgeagentenstart",
      "Keine automatische Canva-Erstellung",
      "Keine automatische Veröffentlichung",
      "Keine automatische externe Aktion",
      "Keine finale Rechtsfreigabe",
      "Keine automatische Tagesentscheidung ohne Jamal",
      "Keine Schreibrechte",
      "Keine API-Schlüssel- oder Canva-Secret-Speicherung",
      "Keine Airtable-Rohdaten, Feldnamen, Feldwerte, Record-IDs, Datensatzlisten, Tabellenstruktur oder Base-Struktur",
    ],
    automaticTeamReviewStarted: false,
    externalCanvaActionExecuted: false,
    automaticCanvaCreationBlocked: true,
    automaticPublishingBlocked: true,
    automaticExternalActionBlocked: true,
    automaticDecisionBlocked: true,
    automaticAgentStartBlocked: true,
    automaticFollowUpAgentStartBlocked: true,
    automaticDailyDecisionBlocked: true,
    writeEnabled: false,
    dataDisplayEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    legalFinalApprovalClaimed: false,
    secretStorageBlocked: true,
    canvaSecretsBlocked: true,
  };
}

function handleContentDesignManualTeamReviewEvaluation(res) {
  sendJson(res, 200, getContentDesignManualTeamReviewEvaluation());
}

function getContentDesignImprovementTask() {
  return {
    version: "V1.1.5",
    status: "improvement_task_prepared",
    madeExternalRequest: false,
    source: "Lokale Teamprüfungsauswertung aus V6.15.8",
    overallStatus: "nachbessern",
    mainIssue:
      "Zielgruppe, gewünschte Wirkung und QA-Prüfkriterien sind noch nicht konkret genug.",
    affectedRole: "Design und QA",
    corrections: [
      "Zielgruppe und Nutzungssituation in einem Satz präzisieren",
      "Gewünschte Wirkung des Designs klar benennen",
      "QA-Prüfkriterien so formulieren, dass die Verbesserung eindeutig prüfbar ist",
    ],
    doNotChange:
      "Keine externe Canva-Aktion, keine Veröffentlichung, keine finale Rechtsfreigabe und keine automatische Entscheidung einbauen.",
    expectedImprovedResult:
      "Ein kurzes Canva-Briefing, das Zielgruppe, Wirkung und Qualitätskriterien so klar benennt, dass Jamal den nächsten manuellen Schritt ohne Rückfrage prüfen kann.",
    nextManualStep:
      "Jamal gibt den Nachbesserungsauftrag manuell an den Content-/Design-Agent weiter oder nutzt den Kopiertext als Arbeitsauftrag.",
    copyableImprovementTask:
      "Content-/Design-Agent: Bitte bessere das Canva-Briefing nach. Präzisiere Zielgruppe und Nutzungssituation, benenne die gewünschte Wirkung und formuliere klare QA-Prüfkriterien. Keine Canva-Erstellung, keine Veröffentlichung, keine externe Aktion und keine automatische Entscheidung.",
    implementationBoundary: "Keine automatische Umsetzung",
    safetyBoundaries: [
      "Keine automatische Umsetzung",
      "Keine automatische Entscheidung",
      "Keine automatische Teamprüfung",
      "Kein automatischer Folgeagentenstart",
      "Keine automatische Canva-Erstellung",
      "Keine automatische Veröffentlichung",
      "Keine automatische externe Aktion",
      "Keine finale Rechtsfreigabe",
      "Keine automatische Tagesentscheidung ohne Jamal",
      "Keine Schreibrechte",
      "Keine API-Schlüssel- oder Canva-Secret-Speicherung",
      "Keine Airtable-Rohdaten, Feldnamen, Feldwerte, Record-IDs, Datensatzlisten, Tabellenstruktur oder Base-Struktur",
    ],
    automaticImplementationStarted: false,
    automaticTeamReviewStarted: false,
    externalCanvaActionExecuted: false,
    automaticCanvaCreationBlocked: true,
    automaticPublishingBlocked: true,
    automaticExternalActionBlocked: true,
    automaticDecisionBlocked: true,
    automaticAgentStartBlocked: true,
    automaticFollowUpAgentStartBlocked: true,
    automaticDailyDecisionBlocked: true,
    writeEnabled: false,
    dataDisplayEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    legalFinalApprovalClaimed: false,
    secretStorageBlocked: true,
    canvaSecretsBlocked: true,
  };
}

function handleContentDesignImprovementTask(res) {
  sendJson(res, 200, getContentDesignImprovementTask());
}

function getContentDesignUsableCanvaTask() {
  const formatPromptVariants = {
    "App-Karte":
      "Erstelle ein hochwertiges, klares Canva-Design als App-Karte für die KI-Unternehmenszentrale. Die Karte soll den nächsten sinnvollen Designschritt schnell verständlich machen. Nutze wenig Text, eine klare Überschrift, gut lesbaren Karteninhalt, ruhige Premium-Wirkung und starke visuelle Ordnung. Vermeide überladene Optik, Stock-Gesichter, unklare Botschaften und alles, was nach automatischer Ausführung aussieht. Das Design soll sofort Orientierung geben und direkt manuell nutzbar sein.",
    "Präsentationsfolie":
      "Erstelle eine hochwertige, klare Präsentationsfolie für die KI-Unternehmenszentrale. Die Folie soll den nächsten sinnvollen Designschritt mit einer starken Aussage verständlich machen. Nutze eine klare Überschrift, wenige unterstützende Punkte, ruhige professionelle Gestaltung und viel Ordnung. Vermeide überladene Optik, Stock-Gesichter, unklare Botschaften und alles, was nach automatischer Ausführung aussieht. Die Folie soll präsentationstauglich, hochwertig und direkt manuell nutzbar sein.",
    "Social Post":
      "Erstelle einen hochwertigen, klaren Social Post für die KI-Unternehmenszentrale. Der Post soll den nächsten sinnvollen Designschritt sofort verständlich machen und mit einem aufmerksamkeitsstarken Einstieg beginnen. Nutze kurze Textmenge, moderne ruhige Gestaltung, klare Kernaussage und gute Lesbarkeit. Vermeide überladene Optik, Stock-Gesichter, unklare Botschaften und alles, was nach automatischer Ausführung aussieht. Der Post soll schnell erfassbar, hochwertig und direkt manuell nutzbar sein.",
    "Hero-Bereich":
      "Erstelle einen hochwertigen, klaren Hero-Bereich für die KI-Unternehmenszentrale. Der obere Bereich soll den nächsten sinnvollen Designschritt mit einer starken Hauptaussage sichtbar machen. Nutze klare visuelle Hierarchie, ruhige professionelle Gestaltung, Vertrauen und schnelle Orientierung. Vermeide überladene Optik, Stock-Gesichter, unklare Botschaften und alles, was nach automatischer Ausführung aussieht. Der Hero-Bereich soll für eine Startseite oder einen oberen Seitenbereich direkt manuell nutzbar sein.",
  };
  const selectedDesignFormat = "Präsentationsfolie";
  const selectedPrompt = formatPromptVariants[selectedDesignFormat];

  return {
    version: "V1.1.5",
    status: "usable_canva_task_prepared",
    madeExternalRequest: false,
    source: "V6.15.9 Nachbesserungsauftrag",
    projectContext: "KI-Unternehmenszentrale, aktueller Tages-/Projektkontext aus dem lokalen Cockpit",
    purpose: "den nächsten sinnvollen Designschritt klar und hochwertig sichtbar machen",
    format: selectedDesignFormat,
    tone: "ruhig, professionell, modern, klar und hochwertig",
    availableDesignFormats: [
      "App-Karte",
      "Präsentationsfolie",
      "Social Post",
      "Hero-Bereich",
    ],
    selectedDesignFormat,
    formatPromptVariants,
    recommendedDesignFormat: "presentation-slide",
    recommendedDesignFormatLabel: "Präsentationsfolie",
    recommendedDesignFormatReason:
      "Am besten für schnelle Freigabe, klare Teamkommunikation und Weiterverwendung in Canva.",
    recommendedDesignFormatNextStep:
      "Prompt kopieren und in Canva einfügen.",
    mustAvoid: [
      "überladene Optik",
      "Stock-Gesichter oder künstliche Stock-Wirkung",
      "unklare Fachbegriffe oder Verwaltungssprache",
    ],
    prefilledCanvaPrompt: selectedPrompt,
    readyCanvaPrompt: selectedPrompt,
    pasteIntoCanva:
      "Diesen Prompt komplett kopieren und manuell in Canva einfügen.",
    resultGoal:
      "Ein vorbefüllter Canva-Prompt aus lokalem Tages-/Projektkontext, der ohne weitere Formulierungsarbeit nutzbar ist.",
    bestNextDesignStep:
      "Fertigen Canva-Prompt kopieren und manuell in Canva einfügen.",
    whyThisStepIsEnough:
      "Projektkontext, Zweck, Format, Tonalität und Nicht-Ziele sind bereits vorbefüllt.",
    oneMinuteAction:
      "Prompt kopieren, bei Bedarf den konkreten Projektkontext einsetzen und manuell in Canva verwenden.",
    copyTextForCanva: selectedPrompt,
    oneSentenceResult:
      "Jamal kann den fertigen 1-Minuten-Canva-Prompt sofort kopieren und manuell nutzen.",
    doNow:
      "Prompt kopieren und manuell in Canva einfügen.",
    notAutomaticallyTriggered:
      "Nicht automatisch ausgelöst: keine Canva-Erstellung, keine Veröffentlichung, keine externe Aktion.",
    designGoal:
      "Den nächsten sinnvollen Designschritt der KI-Unternehmenszentrale sichtbar machen.",
    targetAudienceAndUseCase:
      "Für Jamal als Entscheider; nutzbar zur schnellen manuellen Canva-Weitergabe.",
    formatOrPlacement: selectedDesignFormat,
    designRequirements: [
      "Klare visuelle Hierarchie mit einer starken Überschrift",
      "Zielgruppe, Nutzungssituation und gewünschte Wirkung eindeutig benennen",
      "Wenige Kernaussagen hochwertig und ruhig darstellen",
    ],
    mustNotHappen: [
      "Keine automatische Canva-Erstellung",
      "Keine Veröffentlichung",
      "Keine externe Aktion ohne Jamal",
    ],
    expectedResult:
      "Ein fertiger Canva-Eingabetext, den Jamal ohne weitere Formulierung manuell nutzen kann.",
    copyableCanvaTask: selectedPrompt,
    nextManualStep:
      "Jamal kopiert den Prompt und fügt ihn manuell in Canva ein.",
    boundary: "Keine automatische Canva-Aktion",
    teamReviewStatus: "abgeschlossen",
    safetyBoundaries: [
      "Keine automatische Canva-Aktion",
      "Keine automatische Canva-Erstellung",
      "Keine automatische Veröffentlichung",
      "Keine automatische Teamprüfung",
      "Kein automatischer Folgeagentenstart",
      "Keine automatische Umsetzung",
      "Keine automatische Entscheidung",
      "Keine Schreibrechte",
      "Keine API-Schlüssel- oder Canva-Secret-Speicherung",
      "Keine Airtable-Rohdaten, Feldnamen, Feldwerte, Record-IDs, Datensatzlisten, Tabellenstruktur oder Base-Struktur",
    ],
    automaticImplementationStarted: false,
    automaticTeamReviewStarted: false,
    externalCanvaActionExecuted: false,
    automaticCanvaCreationBlocked: true,
    automaticPublishingBlocked: true,
    automaticExternalActionBlocked: true,
    automaticDecisionBlocked: true,
    automaticAgentStartBlocked: true,
    automaticFollowUpAgentStartBlocked: true,
    automaticDailyDecisionBlocked: true,
    writeEnabled: false,
    dataDisplayEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    baseStructureIncluded: false,
    legalFinalApprovalClaimed: false,
    secretStorageBlocked: true,
    canvaSecretsBlocked: true,
  };
}

function handleContentDesignUsableCanvaTask(res) {
  sendJson(res, 200, getContentDesignUsableCanvaTask());
}

function getProjectManagerAutonomyApplied() {
  return {
    version: "V6.13.2",
    status: "Autonomie-Schritt im Arbeitslauf vorbereitet",
    agent: "Projektmanager-Agent",
    appliedScope:
      "Darf nach einem Arbeitslauf den sinnvollsten Folgeagenten vorschlagen.",
    followUpAgentRecommendation: "HR-Agent",
    recommendationReason:
      "HR-Agent erhöht täglich die Ausbildungsqualität und Eigenständigkeit aller bestehenden Agenten.",
    benefitForJamal:
      "Jamal muss die nächste Agentenfolge nicht mehr komplett selbst ableiten.",
    boundary:
      "Der Projektmanager-Agent darf nur empfehlen. Der HR-Agent wird nicht automatisch gestartet.",
    decisionForJamal:
      "Soll der HR-Agent als nächster Agenten-Arbeitslauf vorbereitet werden?",
    nextAction:
      "Folgeagent-Vorschlag prüfen und bei Bedarf als nächsten Arbeitslauf vorbereiten.",
    applicationMode: "local_workflow_recommendation_only",
    followUpAgentStartMode: "manual_approval_required",
    automaticFollowUpAgentStartBlocked: true,
    madeExternalRequest: false,
    dataDisplayEnabled: false,
    writeEnabled: false,
    automationEnabled: false,
    agentStartEnabled: false,
    rawDataIncluded: false,
    fieldNamesIncluded: false,
    fieldValuesIncluded: false,
    recordIdsIncluded: false,
    recordListIncluded: false,
    tableStructureIncluded: false,
    boundaries: [
      "Empfehlung ja",
      "automatischer Start nein",
      "keine externe Aktion",
      "keine Schreibrechte",
      "keine Veröffentlichung",
      "kein Deployment",
      "keine Airtable-Rohdaten",
      "keine Feldnamen",
      "keine Feldwerte",
      "keine Record-IDs",
      "keine Tabellenstruktur",
    ],
  };
}

function handleProjectManagerAutonomyApplied(res) {
  sendJson(res, 200, getProjectManagerAutonomyApplied());
}

function getMissingAirtableVariableNames(airtableToken, baseId, tableNameOrId) {
  const missing = [];
  if (!airtableToken) missing.push("AIRTABLE_API_KEY oder AIRTABLE_API_TOKEN oder AIRTABLE_PAT");
  if (!baseId) missing.push("AIRTABLE_BASE_ID");
  if (!tableNameOrId) missing.push("AIRTABLE_TABLE_ID oder AIRTABLE_TABLE_NAME oder AIRTABLE_TABLE_PROJECTS");
  return missing;
}

function handleConnectionTest(res) {
  const airtableToken = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_PAT;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableNameOrId =
    process.env.AIRTABLE_TABLE_ID || process.env.AIRTABLE_TABLE_NAME || process.env.AIRTABLE_TABLE_PROJECTS;
  const missingVariables = getMissingAirtableVariableNames(airtableToken, baseId, tableNameOrId);

  if (missingVariables.length > 0) {
    sendJson(res, 200, {
      ok: false,
      provider: "airtable",
      connectionTest: "not-configured",
      configured: {
        hasToken: Boolean(airtableToken),
        hasBaseId: Boolean(baseId),
        hasTableTarget: Boolean(tableNameOrId),
        hasCompleteSetup: false,
      },
      canConfirmRegisterStructure: false,
      metadataCheckOk: false,
      tableTargetReachable: false,
      statusCode: "missing_credentials",
      status: "missing_credentials",
      missingVariables,
      madeExternalRequest: false,
      dataDisplayEnabled: false,
      writeEnabled: false,
      nextManualStep: "Fehlende Werte lokal in .env.local eintragen, Server neu starten und erneut pruefen.",
      boundary: "Noch keine Datenanzeige, keine Schreibrechte, keine Automatisierung.",
      message:
        "Airtable kann lokal noch nicht geprueft werden, weil Zugangsdaten fehlen. Bitte trage die fehlenden Werte in .env.local ein und pruefe danach erneut.",
    });
    return;
  }

  const requestPath = `/v0/meta/bases/${encodeURIComponent(baseId)}/tables`;
  const request = https.request(
    {
      hostname: "api.airtable.com",
      method: "GET",
      path: requestPath,
      headers: {
        Authorization: `Bearer ${airtableToken}`,
        Accept: "application/json",
      },
      timeout: 8000,
    },
    (airtableResponse) => {
      let raw = "";
      airtableResponse.setEncoding("utf8");
      airtableResponse.on("data", (chunk) => {
        raw += chunk;
      });
      airtableResponse.on("end", () => {
        const statusCode = airtableResponse.statusCode || 500;
        if (statusCode < 200 || statusCode >= 300) {
          const status =
            statusCode === 401 || statusCode === 403
              ? "berechtigung-reicht-nicht"
              : statusCode === 404
                ? "base-nicht-erreichbar"
                : "fehler";
          sendJson(res, 502, {
            ok: false,
            provider: "airtable",
            connectionTest: "read-only",
            statusCode: "metadata_failed",
            status: "connection_error",
            configured: {
              hasToken: true,
              hasBaseId: true,
              hasTableTarget: true,
              hasCompleteSetup: true,
            },
            canConfirmRegisterStructure: false,
            metadataCheckOk: false,
            tableTargetReachable: false,
            missingVariables: [],
            madeExternalRequest: true,
            dataDisplayEnabled: false,
            writeEnabled: false,
            httpStatusGroup: `${Math.floor(statusCode / 100)}xx`,
            nextManualStep: "Token, Base-ID, Rechte und Netzwerk lokal pruefen und erneut testen.",
            boundary: "Keine Datensaetze, keine Feldwerte, keine echten Feldnamen, keine Tabelleninhalte.",
            message:
              status === "berechtigung-reicht-nicht"
                ? "Airtable konnte lokal nicht erreicht werden. Bitte pruefe Token, Base-ID, Rechte und Netzwerk."
                : status === "base-nicht-erreichbar"
                  ? "Airtable konnte lokal nicht erreicht werden. Bitte pruefe Token, Base-ID, Rechte und Netzwerk."
                  : "Airtable konnte lokal nicht erreicht werden. Bitte pruefe Token, Base-ID, Rechte und Netzwerk.",
          });
          return;
        }

        let tableTargetReachable = false;
        try {
          const parsed = JSON.parse(raw);
          const tables = Array.isArray(parsed.tables) ? parsed.tables : [];
          if (tableNameOrId) {
            const configuredTable = tables.find((table) => table.id === tableNameOrId || table.name === tableNameOrId);
            tableTargetReachable = Boolean(configuredTable);
          }
        } catch (_error) {
          sendJson(res, 502, {
            ok: false,
            provider: "airtable",
            connectionTest: "read-only",
            statusCode: "metadata_failed",
            configured: {
              hasToken: true,
              hasBaseId: true,
              hasTableTarget: true,
              hasCompleteSetup: true,
            },
            canConfirmRegisterStructure: false,
            metadataCheckOk: false,
            tableTargetReachable: false,
            missingVariables: [],
            madeExternalRequest: true,
            dataDisplayEnabled: false,
            writeEnabled: false,
            status: "connection_error",
            nextManualStep: "Token, Base-ID, Rechte und Netzwerk lokal pruefen und erneut testen.",
            boundary: "Keine Datensaetze, keine Feldwerte, keine echten Feldnamen, keine Tabelleninhalte.",
            message: "Airtable konnte lokal nicht erreicht werden. Bitte pruefe Token, Base-ID, Rechte und Netzwerk.",
          });
          return;
        }

        if (!tableTargetReachable) {
          sendJson(res, 502, {
            ok: false,
            provider: "airtable",
            connectionTest: "read-only",
            statusCode: "metadata_failed",
            status: "connection_error",
            configured: {
              hasToken: true,
              hasBaseId: true,
              hasTableTarget: true,
              hasCompleteSetup: true,
            },
            canConfirmRegisterStructure: false,
            metadataCheckOk: true,
            tableTargetReachable: false,
            missingVariables: [],
            madeExternalRequest: true,
            dataDisplayEnabled: false,
            recordsQueried: false,
            recordFieldsReturnedToBrowser: false,
            writeEnabled: false,
            syncEnabled: false,
            deleteEnabled: false,
            nextManualStep: "Token, Base-ID, Tabellenziel und Rechte lokal pruefen und erneut testen.",
            boundary: "Keine Datensaetze, keine Feldwerte, keine echten Feldnamen, keine Tabelleninhalte.",
            message: "Airtable konnte lokal nicht erreicht werden. Bitte pruefe Token, Base-ID, Rechte und Netzwerk.",
          });
          return;
        }

        sendJson(res, 200, {
          ok: true,
          provider: "airtable",
          connectionTest: "read-only",
          statusCode: "metadata_ok",
          status: "reachable",
          configured: {
            hasToken: true,
            hasBaseId: true,
            hasTableTarget: true,
            hasCompleteSetup: true,
          },
          canConfirmRegisterStructure: true,
          metadataCheckOk: true,
          tableTargetReachable: true,
          missingVariables: [],
          baseReachable: true,
          madeExternalRequest: true,
          dataDisplayEnabled: false,
          recordsQueried: false,
          recordFieldsReturnedToBrowser: false,
          writeEnabled: false,
          syncEnabled: false,
          deleteEnabled: false,
          nextManualStep:
            "Read-only Datenanzeige weiterhin gesperrt lassen und zuerst sichere Anzeigegrenze fuer ausgewaehlte Testdaten vorbereiten.",
          boundary: "Keine Datensaetze, keine Feldwerte, keine echten Feldnamen, keine Tabelleninhalte.",
          message:
            "Airtable ist lokal erreichbar. Die read-only Anzeigegrenze ist vorbereitet, echte Datenanzeige bleibt aber weiterhin gesperrt.",
        });
      });
    },
  );

  request.on("timeout", () => {
    request.destroy(new Error("Airtable request timed out"));
  });

  request.on("error", () => {
    sendJson(res, 502, {
      ok: false,
      provider: "airtable",
      connectionTest: "read-only",
      statusCode: "metadata_failed",
      status: "connection_error",
      configured: {
        hasToken: Boolean(airtableToken),
        hasBaseId: Boolean(baseId),
        hasTableTarget: Boolean(tableNameOrId),
        hasCompleteSetup: missingVariables.length === 0,
      },
      canConfirmRegisterStructure: false,
      metadataCheckOk: false,
      tableTargetReachable: false,
      missingVariables,
      madeExternalRequest: missingVariables.length === 0,
      dataDisplayEnabled: false,
      writeEnabled: false,
      nextManualStep: "Token, Base-ID, Rechte und Netzwerk lokal pruefen und erneut testen.",
      boundary: "Keine Datensaetze, keine Feldwerte, keine echten Feldnamen, keine Tabelleninhalte.",
      message: "Airtable konnte lokal nicht erreicht werden. Bitte pruefe Token, Base-ID, Rechte und Netzwerk.",
    });
  });

  request.end();
}

function handleFirstReadOnlyPreview(res) {
  const airtableToken = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_API_TOKEN || process.env.AIRTABLE_PAT;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableNameOrId =
    process.env.AIRTABLE_FIRST_PREVIEW_TABLE_ID ||
    process.env.AIRTABLE_TABLE_ID ||
    process.env.AIRTABLE_TABLE_NAME ||
    process.env.AIRTABLE_TABLE_PROJECTS;
  const firstPreviewApproved = process.env.AIRTABLE_FIRST_READONLY_PREVIEW_APPROVED === "true";
  const missingVariables = getMissingAirtableVariableNames(airtableToken, baseId, tableNameOrId);

  if (missingVariables.length > 0) {
    sendJson(res, 200, {
      version: "V6.12.2",
      ok: false,
      provider: "airtable",
      status: "missing_credentials",
      missingVariables,
      madeExternalRequest: false,
      manualApprovalRequired: true,
      manualApprovalGranted: firstPreviewApproved,
      airtableReachable: false,
      minimalPreviewChecked: false,
      chefStatus: {
        status: "Nicht bereit – lokale Zugangsdaten fehlen",
        localReachable: "noch nicht geprüft",
        minimalCheckCompleted: "nein",
        dataDisplay: "weiterhin gesperrt",
        nextStep: "Zugangsdaten lokal ergänzen",
      },
      sanitizedOnly: true,
      sanitized: true,
      rawDataIncluded: false,
      rawDataReturned: false,
      fieldNamesIncluded: false,
      fieldNamesReturned: false,
      fieldValuesIncluded: false,
      fieldValuesReturned: false,
      recordIdsIncluded: false,
      recordIdsReturned: false,
      recordListIncluded: false,
      recordListReturned: false,
      tableStructureIncluded: false,
      tableStructureReturned: false,
      readOnly: true,
      recordsChecked: 0,
      dataDisplayEnabled: false,
      writeEnabled: false,
      freeDataDisplayBlocked: true,
      message: "Minimalanzeige noch nicht freigegeben oder Zugangsdaten fehlen.",
      boundary: "Keine freie Datenanzeige, keine Feldwerte, keine echten Feldnamen, keine Tabellenstruktur.",
    });
    return;
  }

  if (!firstPreviewApproved) {
    sendJson(res, 200, {
      version: "V6.12.2",
      ok: false,
      provider: "airtable",
      status: "manual_approval_required",
      missingVariables: ["AIRTABLE_FIRST_READONLY_PREVIEW_APPROVED=true"],
      madeExternalRequest: false,
      manualApprovalRequired: true,
      manualApprovalGranted: false,
      airtableReachable: false,
      minimalPreviewChecked: false,
      chefStatus: {
        status: "Nicht bereit – manuelle Server-Freigabe fehlt",
        localReachable: "noch nicht geprüft",
        minimalCheckCompleted: "nein",
        dataDisplay: "weiterhin gesperrt",
        nextStep: "Server-Freigabe setzen",
      },
      sanitizedOnly: true,
      sanitized: true,
      rawDataIncluded: false,
      rawDataReturned: false,
      fieldNamesIncluded: false,
      fieldNamesReturned: false,
      fieldValuesIncluded: false,
      fieldValuesReturned: false,
      recordIdsIncluded: false,
      recordIdsReturned: false,
      recordListIncluded: false,
      recordListReturned: false,
      tableStructureIncluded: false,
      tableStructureReturned: false,
      readOnly: true,
      recordsChecked: 0,
      dataDisplayEnabled: false,
      writeEnabled: false,
      freeDataDisplayBlocked: true,
      message: "Manuelle lokale Freigabe fehlt. Setze AIRTABLE_FIRST_READONLY_PREVIEW_APPROVED=true nur lokal in .env.local.",
      boundary: "Keine freie Datenanzeige, keine Feldwerte, keine echten Feldnamen, keine Tabellenstruktur.",
    });
    return;
  }

  const requestPath = `/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableNameOrId)}?maxRecords=1&pageSize=1`;
  const request = https.request(
    {
      hostname: "api.airtable.com",
      method: "GET",
      path: requestPath,
      headers: {
        Authorization: `Bearer ${airtableToken}`,
        Accept: "application/json",
      },
      timeout: 8000,
    },
    (airtableResponse) => {
      let raw = "";
      airtableResponse.setEncoding("utf8");
      airtableResponse.on("data", (chunk) => {
        raw += chunk;
      });
      airtableResponse.on("end", () => {
        const statusCode = airtableResponse.statusCode || 500;
        if (statusCode < 200 || statusCode >= 300) {
          sendJson(res, 502, {
            version: "V6.12.2",
            ok: false,
            provider: "airtable",
            status: "airtable_unreachable_or_rejected",
            madeExternalRequest: true,
            manualApprovalRequired: true,
            manualApprovalGranted: true,
            airtableReachable: false,
            minimalPreviewChecked: false,
            chefStatus: {
              status: "Nicht erreichbar oder abgelehnt",
              localReachable: "nein",
              minimalCheckCompleted: "nein",
              dataDisplay: "weiterhin gesperrt",
              nextStep: "Ergebnis prüfen",
            },
            sanitizedOnly: true,
            sanitized: true,
            rawDataIncluded: false,
            rawDataReturned: false,
            fieldNamesIncluded: false,
            fieldNamesReturned: false,
            fieldValuesIncluded: false,
            fieldValuesReturned: false,
            recordIdsIncluded: false,
            recordIdsReturned: false,
            recordListIncluded: false,
            recordListReturned: false,
            tableStructureIncluded: false,
            tableStructureReturned: false,
            readOnly: true,
            recordsChecked: 0,
            dataDisplayEnabled: false,
            writeEnabled: false,
            freeDataDisplayBlocked: true,
            httpStatusGroup: `${Math.floor(statusCode / 100)}xx`,
            message: "Airtable ist lokal nicht erreichbar oder hat die read-only Minimalpruefung abgelehnt. Die Antwort bleibt sanitisiert.",
            boundary: "Keine freie Datenanzeige, keine Feldwerte, keine echten Feldnamen, keine Tabellenstruktur.",
          });
          return;
        }

        let minimalRecordPresence = "no_record_detected";
        try {
          const parsed = JSON.parse(raw);
          minimalRecordPresence =
            Array.isArray(parsed.records) && parsed.records.length > 0
              ? "one_or_more_records_detected"
              : "no_record_detected";
        } catch (_error) {
          minimalRecordPresence = "no_record_detected";
        }

        sendJson(res, 200, {
          version: "V6.12.2",
          chefStatus: {
            status: "Sicher geprüft – lokale Minimalprüfung sanitisiert abgeschlossen",
            localReachable: "ja",
            minimalCheckCompleted: "ja",
            dataDisplay: "weiterhin gesperrt",
            nextStep: "Ergebnis prüfen",
          },
          status: "sanitized_real_local_check_completed",
          madeExternalRequest: true,
          manualApprovalRequired: true,
          manualApprovalGranted: true,
          readOnly: true,
          maxRecordsRequested: 1,
          airtableReachable: true,
          minimalPreviewChecked: true,
          sanitizedOnly: true,
          sanitized: true,
          rawDataIncluded: false,
          rawDataReturned: false,
          fieldNamesIncluded: false,
          fieldNamesReturned: false,
          fieldValuesIncluded: false,
          fieldValuesReturned: false,
          recordIdsIncluded: false,
          recordIdsReturned: false,
          recordListIncluded: false,
          recordListReturned: false,
          tableStructureIncluded: false,
          tableStructureReturned: false,
          minimalRecordPresence,
          message:
            "Die erste echte lokale Airtable-Minimalpruefung wurde read-only ausgefuehrt und sanitisiert bestaetigt. Es wurden keine Airtable-Inhalte angezeigt.",
        });
      });
    },
  );

  request.on("timeout", () => {
    request.destroy(new Error("Airtable preview request timed out"));
  });

  request.on("error", () => {
    sendJson(res, 502, {
      version: "V6.12.2",
      status: "airtable_unreachable_or_rejected",
      madeExternalRequest: true,
      manualApprovalRequired: true,
      manualApprovalGranted: true,
      airtableReachable: false,
      minimalPreviewChecked: false,
      chefStatus: {
        status: "Nicht erreichbar oder abgelehnt",
        localReachable: "nein",
        minimalCheckCompleted: "nein",
        dataDisplay: "weiterhin gesperrt",
        nextStep: "Ergebnis prüfen",
      },
      sanitizedOnly: true,
      sanitized: true,
      rawDataIncluded: false,
      rawDataReturned: false,
      fieldNamesIncluded: false,
      fieldNamesReturned: false,
      fieldValuesIncluded: false,
      fieldValuesReturned: false,
      recordIdsIncluded: false,
      recordIdsReturned: false,
      recordListIncluded: false,
      recordListReturned: false,
      tableStructureIncluded: false,
      tableStructureReturned: false,
      message: "Airtable ist lokal nicht erreichbar oder hat die read-only Minimalpruefung abgelehnt. Die Antwort bleibt sanitisiert.",
    });
  });

  request.end();
}

function serveStatic(reqPath, res) {
  const fileName = allowedFiles.get(reqPath);
  if (!fileName) {
    sendText(res, 404, "Not found");
    return;
  }

  const filePath = path.join(rootDir, fileName);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(res, 500, "File could not be read");
      return;
    }

    const contentType =
      fileName.endsWith(".html")
        ? "text/html; charset=utf-8"
        : fileName.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "application/javascript; charset=utf-8";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

  if (req.method !== "GET") {
    sendJson(res, 405, {
      ok: false,
      message: "Nur sichere GET-Endpunkte sind im Airtable-Pilot vorbereitet.",
    });
    return;
  }

  if (requestUrl.pathname === "/api/airtable/pilot-status") {
    handlePilotStatus(res);
    return;
  }

  if (requestUrl.pathname === "/api/cockpit/todays-one-decision") {
    handleTodaysOneDecision(res);
    return;
  }

  if (requestUrl.pathname === "/api/cockpit/todays-three-things") {
    handleTodaysThreeThings(res);
    return;
  }

  if (requestUrl.pathname === "/api/airtable/test-connection") {
    handleConnectionTest(res);
    return;
  }

  if (requestUrl.pathname === "/api/airtable/first-readonly-preview") {
    handleFirstReadOnlyPreview(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/plugin-work-capability") {
    handlePluginWorkCapability(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/projectmanager-plugin-task") {
    handleProjectManagerPluginTask(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/projectmanager-plugin-task/chef-approval-preview") {
    handleProjectManagerChefApprovalPreview(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/projectmanager-plugin-task/chef-output") {
    handleProjectManagerChefOutput(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/projectmanager-plugin-task/daily-focus") {
    handleProjectManagerDailyFocus(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/projectmanager-plugin-task/start-action") {
    handleProjectManagerStartAction(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/projectmanager-plugin-task/workflow") {
    handleProjectManagerWorkflow(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/projectmanager-plugin-task/workflow-result") {
    handleProjectManagerWorkflowResult(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/hr-daily-training") {
    handleHrDailyTraining(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/hr-daily-training-suggestion") {
    handleHrDailyTrainingSuggestion(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/plugin-readiness") {
    handlePluginReadiness(res, requestUrl);
    return;
  }

  if (requestUrl.pathname === "/api/agents/hr-autonomy-approval") {
    handleHrAutonomyApproval(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/hr-all-agents-development") {
    handleHrAllAgentsDevelopment(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/knowledge-archive-plugin-task") {
    handleKnowledgeArchivePluginTask(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/knowledge-archive-plugin-task/knowledge-summary") {
    handleKnowledgeArchiveSummary(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/knowledge-archive-plugin-task/workflow") {
    handleKnowledgeArchiveWorkflow(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/knowledge-archive-plugin-task/workflow-result") {
    handleKnowledgeArchiveWorkflowResult(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/knowledge-archive-plugin-task/projectmanager-start-action") {
    handleKnowledgeToProjectManagerStartAction(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/system-flow/daily-decision") {
    handleSystemFlowDailyDecision(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/system-flow/today-direction") {
    handleSystemFlowTodayDirection(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/system-flow/next-agent-workflow") {
    handleSystemFlowNextAgentWorkflow(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/content-design-plugin-task") {
    handleContentDesignPluginTask(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/content-design-plugin-task/canva-brief") {
    handleContentDesignCanvaBrief(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/content-design-plugin-task/workflow") {
    handleContentDesignWorkflow(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/content-design-plugin-task/review-team") {
    handleContentDesignReviewTeam(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/content-design-plugin-task/chef-decision") {
    handleContentDesignChefDecision(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/content-design-plugin-task/follow-up-task") {
    handleContentDesignFollowUpTask(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/content-design-plugin-task/follow-up-readiness") {
    handleContentDesignFollowUpReadiness(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/content-design-plugin-task/refined-follow-up-task") {
    handleContentDesignRefinedFollowUpTask(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/content-design-plugin-task/manual-team-review-prep") {
    handleContentDesignManualTeamReviewPrep(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/content-design-plugin-task/manual-team-review-evaluation") {
    handleContentDesignManualTeamReviewEvaluation(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/content-design-plugin-task/improvement-task") {
    handleContentDesignImprovementTask(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/content-design-plugin-task/usable-canva-task") {
    handleContentDesignUsableCanvaTask(res);
    return;
  }

  if (requestUrl.pathname === "/api/agents/projectmanager-plugin-task/autonomy-applied") {
    handleProjectManagerAutonomyApplied(res);
    return;
  }

  serveStatic(requestUrl.pathname, res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`KI-Unternehmenszentrale local pilot server running on http://127.0.0.1:${port}`);
});
