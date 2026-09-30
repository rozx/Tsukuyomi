export default {
  aiImportErrors: {
    planStaleTheOperationNoLongerExists: 'The operation no longer exists',
    planStaleTheImportPlanDoesNotExist: 'The import plan does not exist or belongs to another task',
    planStaleTheDraftOrPreviewChangedReview: 'The draft or preview changed; review it again',
    taskBusyTheImportTaskIsStillRunning: 'The import task is still running',
    planConflictResolveTheRequiredChoicesAndMatching:
      'Resolve the required choices and matching conflicts first',
    planStaleAnAffectedChapterIDIsReferenced:
      'An affected chapter ID is referenced by another novel',
    bookReadFailedDetail: '{value1}',
    planStaleANewChapterIDIsAlready: 'A new chapter ID is already in use',
    planStaleTheDraftChanged: 'The draft changed',
    bookReadFailedFailedToReadAffectedChapterContent: 'Failed to read affected chapter content',
    planStaleTheTargetNovelChangedGenerateAnother:
      'The target novel changed; generate another preview',
    planStaleThePlanIsNoLongerValid: 'The plan is no longer valid',
    creationLocaleChangedDetail: '{value1}',
    planStaleTheTargetNovelChanged: 'The target novel changed',
    undoUnavailableTheOperationWasNotAppliedOr:
      'The operation was not applied or its snapshot is unavailable',
    taskBusyWaitForTheImportTaskTo: 'Wait for the import task to stop',
    bookChangedTheTargetNovelHasLaterChanges:
      'The target novel has later changes; the whole import cannot be undone',
    confirmationRequiredThisWorkspaceRequiresUserConfirmationOf:
      'This workspace requires user confirmation of this specific plan',
    invalidArgumentsChooseExactlyOneOfSourceIds:
      'Choose exactly one of source_ids, discovery_ids, or catalog',
    sourceScopeSelectChapterOrFileReferencesContents:
      'Select chapter or file references; contents, covers, and next pages cannot form a chapter batch',
    sourceScopeTheContentsSnapshotBelongsToAnother:
      'The contents snapshot belongs to another task or has not been inspected',
    invalidPageTheRangeExceedsDiscoveredChaptersA:
      'The range exceeds discovered chapters; a truncated view is not complete contents',
    noMatchesNoMatchesInTheCurrentSource: 'No matches in the current source range',
    batchNotFoundTheBatchDoesNotExistOr: 'The batch does not exist or belongs to another task',
    draftChangedTheDraftChangedAndTheBatch:
      'The draft changed and the batch stopped; reread the draft before continuing',
    sourceScopeTheNovelScopeChangedReviewThe: 'The novel scope changed; review the batch again',
    draftChangedABatchChapterWasEditedOr:
      'A batch chapter was edited or deleted; organize it separately',
    draftChangedReadTheLatestDraftFirst: 'Read the latest draft first',
    draftChangedTheDraftChangedRereadIt: 'The draft changed; reread it',
    invalidOperationTheDestinationVolumeDoesNotExist: 'The destination volume does not exist',
    batchLimitABatchRequiresDistinctSources: 'A batch requires 1–500 distinct sources',
    sourceOverlapTheSourceAlreadyHasDraftChapters:
      'The source already has draft chapters; edit those chapters or retry the original batch',
    metadataLimitTheSourceNameIsUnsuitableAs:
      'The source name is unsuitable as a chapter title; organize it separately',
    invalidRangeInvalidNumberOfExclusionRanges: 'Invalid number of exclusion ranges',
    invalidRangeExclusionRangesAreOutOfBounds:
      'Exclusion ranges are out of bounds, overlap, or split a character',
    invalidContentRefTheExtractionResultDoesNotMatch: 'The extraction result does not match',
    invalidRangeBlockOffsetsRequireAStartingBlock: 'Block offsets require a starting block',
    invalidContentRefTheContentBlockIsMissingOr:
      'The content block is missing or its order is invalid',
    contentRoleMetadataBlocksCannotBeNovelContent: 'Metadata blocks cannot be novel content',
    invalidRangeTheContentRangeIsOutOf: 'The content range is out of bounds or splits a character',
    invalidRangeTheContentRangeExceedsTheOriginal: 'The content range exceeds the original data',
    emptyContentNoBodyTextWasExtractedAdjust: 'No body text was extracted; adjust the rules',
    undecodedSourceDecodeTheSourceFirst: 'Decode the source first',
    unreadableResourceTheResourceHasNoReadableText: 'The resource has no readable text',
    invalidPageReadAtMostCharactersAtA: 'Read at most 16000 characters at a time',
    invalidContentRefTheBodyReferenceIsNotAn: 'The body reference is not an extraction result',
    metadataOnlyMetadataSourcesCannotBeNovelContent: 'Metadata sources cannot be novel content',
    bookChangedTheExistingContentReferenceIsOutdated:
      'The existing content reference is outdated or unreadable',
    chapterReadFailedExistingChapterContentCannotBeRead: 'Existing chapter content cannot be read',
    chapterNotReadyBodyCleanupAcceptsOnlyReadyChapters:
      'Body cleanup accepts only ready chapters; reduce the scope',
    processingLimitTooMuchBodyTextInThe: 'Too much body text in the batch; reduce the scope',
    emptyContentTheRuleWouldEmptyTheChapter:
      'The rule would empty the chapter; adjust it or delete the chapter explicitly',
    invalidScopeTheScopeContainsMissingOrDuplicate: 'The scope contains missing or duplicate IDs',
    invalidScopeVolumeTitlesAcceptOnlyVolumeIDs:
      'Volume titles accept only volume IDs or a title filter',
    batchLimitABatchIsLimitedToItems: 'A batch is limited to 500 items; reduce the scope',
    invalidOperationBodyOperationsCanOnlyRemoveMatching:
      'Body operations can only remove matching fragments or lines',
    invalidOperationTitleChangesMustUseReplace: 'Title changes must use replace',
    metadataLimitTitlesMustBeNonemptyAndAt: 'Titles must be nonempty and at most 500 characters',
    draftChangedTheDraftChangedGenerateAnotherPreview:
      'The draft changed; generate another preview',
    taskNotFoundTheImportTaskDoesNotExist: 'The import task does not exist',
    batchNotFoundTheDraftBatchDoesNotExist:
      'The draft batch does not exist or belongs to another task',
    invalidOperationInvalidDraftRevisionOrOperationCount:
      'Invalid draft revision or operation count',
    invalidOperationUnknownDraftOperation: 'Unknown draft operation',
    invalidOperationOrderingMustIncludeEveryItemExactly:
      'Ordering must include every item exactly once',
    invalidOperationUnknownMetadataField: 'Unknown metadata field',
    bookReadFailedTheTargetNovelDoesNotExist: 'The target novel does not exist or cannot be read',
    invalidOperationInvalidChapterMatchTarget: 'Invalid chapter match target',
    userMatchProtectedPreserveTheUserSSelectedChapter:
      "Preserve the user's selected chapter matches",
    novelChoiceRequiredSelectANovelFirst: 'Select a novel first',
    metadataLimitVolumeTitlesAreLimitedToCharacters: 'Volume titles are limited to 500 characters',
    invalidOperationTheChapterDoesNotExist: 'The chapter does not exist',
    invalidOperationTheVolumeDoesNotExist: 'The volume does not exist',
    invalidOperationInvalidCompletenessInformation: 'Invalid completeness information',
    taskBusyImportChangesAreBeingCommitted: 'Import changes are being committed',
    taskBusyPauseTheAssistantAndWaitFor:
      'Pause the assistant and wait for the current operation before deleting the draft',
    questionChangedTheSelectionQuestionOrSourceScope:
      'The selection question or source scope changed',
    invalidSelectionTheNovelCandidateDoesNotExist: 'The novel candidate does not exist',
    invalidOperationTheOperationContainsUnknownFieldsOr:
      'The operation contains unknown fields or invalid data',
    invalidOperationInvalidDetail: 'Invalid {value1}',
    invalidContentRefUnknownBodyReference: 'Unknown body reference',
    sourceScopeTheContentBelongsToAnotherTask: 'The content belongs to another task',
    sourceScopeTheSourceBelongsToAnotherTask: 'The source belongs to another task',
    sourceRemovedTheUserRemovedABatchSource:
      'The user removed a batch source; add it again or organize the retained draft separately',
    metadataOnlyMetadataSourcesCannotBeBodyText: 'Metadata sources cannot be body text',
    sourceScopeTheSourceIsExcludedOrIs: 'The source is excluded or is not a chapter resource',
    sourceScopeBatchSourcesAreNotFullyAssigned:
      'Batch sources are not fully assigned to the selected novel',
    sourceScopeBatchSourcesMayBelongToSeveral: 'Batch sources may belong to several works',
    invalidContentRefBodyReferencesMustUseExtractionResults:
      'Body references must use extraction results',
    sourceScopeTheSourceIsExcluded: 'The source is excluded',
    invalidOperationNovelCandidatesMustBeNonemptyDistinct:
      'Novel candidates must be nonempty, distinct, and limited to 50',
    metadataLimitNovelTitlesAreLimitedToCharacters: 'Novel titles are limited to 500 characters',
    invalidOperationInvalidCandidateSourceList: 'Invalid candidate source list',
    metadataOnlySearchResultsCannotAuthorizeNovelBody:
      'Search results cannot authorize novel body text',
    invalidOperationCandidateBodyRangesMustBeNonempty: 'Candidate body ranges must be nonempty',
    sourceScopeNovelCandidatesCanOnlyDeclareAuthorized:
      'Novel candidates can only declare authorized input source ranges',
    novelChoiceRequiredConfirmTheSingleNovelForThis: 'Confirm the single novel for this task first',
    targetScopeTheExistingParagraphBelongsToAnother:
      'The existing paragraph belongs to another target',
    bookReadFailedCannotReadTheTargetNovel: 'Cannot read the target novel',
    bookChangedTheTargetNovelSnapshotChanged: 'The target novel snapshot changed',
    invalidContentRefTheExistingParagraphDoesNotExist: 'The existing paragraph does not exist',
    metadataLimitChapterTitlesAreLimitedToCharacters:
      'Chapter titles are limited to 500 characters',
    invalidOperationInvalidChapterVolumeOrContent: 'Invalid chapter volume or content',
    sourceScopeThisBodyRangeHasNotBeen:
      'This body range has not been assigned to the selected novel',
    sourceScopeTheBodyBelongsToSeveralNovels:
      'The body belongs to several novels; refine the scope',
    emptyContentReadyChaptersRequireExtractedBodyText: 'Ready chapters require extracted body text',
    invalidArchivePathInvalidEPUBURIEncoding: 'Invalid EPUB URI encoding',
    invalidArchivePathTheEPUBReferenceEscapesThePackage:
      'The EPUB reference escapes the package root',
    epubStructureMissingDetail: 'Missing {value1}',
    archiveLimitTheXMLResourceExceedsTheParsing: 'The XML resource exceeds the parsing limit',
    epubEncryptedEPUBContentOrResourcesAreEncrypted:
      'EPUB content or resources are encrypted and cannot be extracted',
    epubStructureInvalidManifestIDOrResource: 'Invalid manifest ID or resource',
    archiveLimitTheEPUBTextEntryExceedsThe: 'The EPUB text entry exceeds the parsing limit',
    epubStructureTheFileIsNotAnEPUB: 'The file is not an EPUB container',
    epubStructureTheContainerHasNoOPF: 'The container has no OPF',
    epubStructureTheSpineReferencesTheSameBody:
      'The spine references the same body resource more than once',
    invalidPatternPatternsMustContainCharacters: 'Patterns must contain 1–1000 characters',
    invalidPatternFlagsSupportOnlyGIM: 'Flags support only g, i, m, s, and u, without duplicates',
    invalidPatternInvalidRegularExpression: 'Invalid regular expression',
    sourceScopeTheSnapshotBelongsToAnotherSource: 'The snapshot belongs to another source',
    invalidEncodingPagesAreAlreadyDecodedByThe:
      'Pages are already decoded by the request layer; byte encoding applies only to files',
    processingLimitThePageExceedsTheTextLimit: 'The page exceeds the text limit',
    sourceUnavailableTheFileWasNotSavedProvide: 'The file was not saved; provide it again',
    processingLimitTheFileExceedsTheInputLimit: 'The file exceeds the input limit',
    unsupportedFormatPDFBodyParsingIsUnavailableProvide:
      'PDF body parsing is unavailable; provide readable text',
    epubStructureTheEPUBSnapshotWasNotUnpacked: 'The EPUB snapshot was not unpacked correctly',
    invalidPageInvalidSourceInspectionPagination: 'Invalid source inspection pagination',
    metadataOnlyMetadataSourcesCannotBeExtractedAs:
      'Metadata sources cannot be extracted as novel content',
    selectResourceInspectTheSourceAndSelectA:
      'Inspect the source and select a chapter resource first',
    sourceUnavailableTheSourceHasNoUsableBody: 'The source has no usable body; provide a file',
    emptyContentTheCurrentRulesExtractedNoNovel:
      'The current rules extracted no novel content; adjust the scope',
    batchLimitExtractionRequiresDistinctSources: 'Extraction requires 1–8 distinct sources',
    invalidPresetUnknownExtractionPreset: 'Unknown extraction preset',
    invalidSelectorInvalidCSSScopeOrExclusionRules: 'Invalid CSS scope or exclusion rules',
    invalidChapterContentTheChapterContentRecordIsCorrupt: 'The chapter content record is corrupt',
    invalidChapterContentInvalidParagraphOrTranslationData: 'Invalid paragraph or translation data',
    invalidChapterContentDuplicateParagraphID: 'Duplicate paragraph ID',
    invalidBookTheNovelDataIsCorrupt: 'The novel data is corrupt',
    invalidBookTheModificationRevisionIsCorrupt: 'The modification revision is corrupt',
    invalidBookTheVolumeChapterDataIsCorrupt: 'The volume/chapter data is corrupt',
    invalidBookInvalidChapterID: 'Invalid chapter ID',
    invalidPageAPageMustContainItems: 'A page must contain 1–100 items',
    bookNotFoundTheSpecifiedNovelDoesNotExist: 'The specified novel does not exist',
    invalidQueryLibraryQueriesMustBeText: 'Library queries must be text',
    targetScopeTheChapterBelongsToAnotherNovel: 'The chapter belongs to another novel',
    invalidQueryInvalidMetadataSearchQuery: 'Invalid metadata search query',
    draftChangedTheDraftChangedReviewMetadataCandidates:
      'The draft changed; review metadata candidates again',
    metadataChangedTheCandidateOrNovelScopeChanged: 'The candidate or novel scope changed',
    draftChangedTheDraftChanged: 'The draft changed',
    invalidOperationInvalidMetadataFieldOrSelection: 'Invalid metadata field or selection',
    invalidCoverCoverURLsCannotUseTemporaryObject: 'Cover URLs cannot use temporary object URLs',
    invalidCoverTheCoverResourceReferenceIsMissing: 'The cover resource reference is missing',
    invalidCoverTheImageResourceIsUnavailable: 'The image resource is unavailable',
    coverLimitTheCoverExceedsMiB: 'The cover exceeds 10 MiB',
    invalidCoverCoversRequireAnHTTPSImage:
      'Covers require an HTTP(S) image URL or an image resource in this task',
    invalidCoverTheSpecifiedResourceIsNotAn: 'The specified resource is not an image',
    invalidCoverTheImageURLWasNotObserved: 'The image URL was not observed in the source',
    metadataLimitMetadataExceedsTheFieldLengthLimit: 'Metadata exceeds the field length limit',
    sourceScopeTheMetadataResourceBelongsToAnother:
      'The metadata resource belongs to another source',
    matchInputDuplicateOldParagraphIdentity: 'Duplicate old paragraph identity',
    matchInputConflictingNewParagraphIDs: 'Conflicting new paragraph IDs',
    matchingLimitTheMatchingScopeExceedsThisEnvironment:
      "The matching scope exceeds this environment's limit",
    matchInputDuplicateNewParagraphSourceIdentity: 'Duplicate new paragraph source identity',
    regexWorkerRequiredRegexProcessingRequiresAWorkerUse:
      'Regex processing requires a Worker; use literal matching or check the environment',
    processingLimitWorkerParsingTimedOut: 'Worker parsing timed out',
    invalidRangeTheRangeIsOutOfBounds: 'The range is out of bounds or splits a character',
    invalidRangeSelectionRangesOverlapOrAreOut: 'Selection ranges overlap or are out of order',
    invalidRangeHTMLRangesMustCoverWholeBody:
      'HTML ranges must cover whole body blocks; use extracted content references for offsets within a block',
    processingLimitTheChapterSplittingTextExceedsThe:
      'The chapter-splitting text exceeds the limit',
    processingLimitInputExceedsThisParsingEnvironmentS:
      "Input exceeds this parsing environment's limit",
    processingLimitDecodedTextExceedsTheLimit: 'Decoded text exceeds the limit',
    processingLimitTextExceedsThisParsingEnvironmentS:
      "Text exceeds this parsing environment's limit",
    processingLimitTooMuchTextForBatchMatching:
      'Too much text for batch matching; reduce the scope',
    processingLimitTheReplacementResultIsTooLong: 'The replacement result is too long',
    emptyMatchEditingRulesCannotMatchAnEmpty: 'Editing rules cannot match an empty string',
    processingLimitTooManyMatches: 'Too many matches',
    invalidPatternTitleReplacementTextIsLimitedTo:
      'Title replacement text is limited to 500 characters',
    bookChangedTheExistingContentReferenceIsOutdatedVariant177:
      'The existing content reference is outdated',
    invalidContentRefTheBodyIsNotAnExtraction: 'The body is not an extraction result',
    draftChangedTheDraftChangedVariant179: 'The draft changed',
    sourceScopeTheBodyResourceDoesNotExist: 'The body resource does not exist',
    planStaleNewRequiredQuestionsArePending: 'New required questions are pending',
    planStaleTheChapterSettingsSourceIsOutside: 'The chapter settings source is outside this plan',
    planStaleReviewChapterSettingsAgain: 'Review chapter settings again',
    planStaleTheReplacementScopeDoesNotExist: 'The replacement scope does not exist',
    planStaleReviewTheReplacementScopeAgain: 'Review the replacement scope again',
    bookReadFailedFailedToReadTheTargetNovel: 'Failed to read the target novel',
    chapterReadFailedFailedToReadTheOriginalChapter: 'Failed to read the original chapter',
    paragraphNotFoundTheOriginalParagraphDoesNotExist: 'The original paragraph does not exist',
    chapterNotFoundTheDraftChapterDoesNotExist: 'The draft chapter does not exist',
    invalidContentRefTheExtractionResultDoesNotExist: 'The extraction result does not exist',
    invalidArgumentsQuestionMustBeNonempty: 'question must be nonempty',
    invalidArgumentsQuestionsMustBeNonempty: 'questions must be nonempty',
    invalidAnswerAnswersMustBeNonempty: 'Answers must be nonempty',
    invalidAnswerAnswersAreLimitedToDetailCharacters: 'Answers are limited to {value1} characters',
    invalidAnswerTheSelectedOptionDoesNotMatch: 'The selected option does not match the answer',
    invalidAnswerChooseOnlyFromTheProvidedOptions: 'Choose only from the provided options',
    invalidAnswerAnswerEveryQuestion: 'Answer every question',
    invalidAnswerInvalidQuestionIndex: 'Invalid question index',
    questionChangedTheQuestionChanged: 'The question changed',
    questionChangedTheQuestionChangedOrWasAlready: 'The question changed or was already answered',
    toolPairTheCheckpointReferencesAnIncompleteTool:
      'The checkpoint references an incomplete tool call',
    runStaleExecutionStoppedOrWasReplacedBy: 'Execution stopped or was replaced by a new run',
    incompleteToolCallToolArgumentsHaveNotBeenFully: 'Tool arguments have not been fully received',
    toolPairTheToolCallIdentityIsMissing: 'The tool call identity is missing',
    toolPairTheToolCallWasAlreadyRecorded: 'The tool call was already recorded',
    toolPairTheToolResultHasNoMatching: 'The tool result has no matching call or was already saved',
    sourceScopeInvalidSourceAuthorization: 'Invalid source authorization',
    sourceScopeTheParentSourceDoesNotAllow: 'The parent source does not allow this use',
    sourceScopeDerivedContentSourcesRequireAParent:
      'Derived content sources require a parent source',
    sourceScopeTheResourceBelongsToAnotherSource: 'The resource belongs to another source',
    sourceScopeTheExtractionResultHasNoValid: 'The extraction result has no valid source snapshot',
    sourceScopeSourceAuthorizationCannotBeChanged: 'Source authorization cannot be changed',
    invalidPageInvalidCursor: 'Invalid cursor',
    sourceRemovedTheUserRemovedTheSourceAdd:
      'The user removed the source; add it again. The generated draft is retained',
    sourceScopeTheResourceBelongsToAnotherTask: 'The resource belongs to another task',
    taskBusyWaitForTheTaskToStop: 'Wait for the task to stop',
    maintenancePendingTheImportedNovelSCacheIndex:
      "The imported novel's cache/index maintenance is incomplete; retry maintenance first",
    sourceScopeTheDiscoveryReferenceDoesNotExist:
      'The discovery reference does not exist or belongs to another task',
    invalidUrlOnlyHTTPSURLsWithoutLogin: 'Only HTTP(S) URLs without login credentials are accepted',
    invalidPathFilesMustRemainInsideTheUser: 'Files must remain inside the user-selected directory',
    sourceRemovedTheUserRemovedThisSourceAsk:
      'The user removed this source; ask them to add it again',
    taskBusyPauseTheTaskAndWaitFor:
      'Pause the task and wait for its operation before deleting a source',
    emptyDirectoryNoFilesWereSelected: 'No files were selected',
    invalidPathDuplicateFilePath: 'Duplicate file path',
    notDirectoryTheSourceIsNotARegistered: 'The source is not a registered directory',
    invalidPageInvalidDirectoryPagination: 'Invalid directory pagination',
    sourceScopeTheFileIsOutsideTheAuthorized: 'The file is outside the authorized source scope',
    batchLimitAddDiscoveryReferencesAtATime: 'Add 1–16 discovery references at a time',
    sourceScopeTheDiscoveryReferenceBelongsToAnother:
      'The discovery reference belongs to another task',
    sourceScopeNoObservedResourceReferenceWasFound: 'No observed resource reference was found',
    sourceScopeTheParentSourceBelongsToAnother: 'The parent source belongs to another task',
    sourceRemovedTheUserRemovedTheParentSource:
      'The user removed the parent source; its discoveries cannot be added',
    storageFailedDetail: '{value1}',
    emptyMatchTitlesCannotMatchAnEmptyString: 'Titles cannot match an empty string',
    invalidBoundaryTitleRulesMustMatchStandaloneHeading:
      'Title rules must match standalone heading lines',
    processingLimitTooManyHeadingMatchesReduceThe: 'Too many heading matches; reduce the scope',
    invalidBoundaryTitlesMustBeNonemptyAndAt: 'Titles must be nonempty and at most 500 characters',
    noChaptersNoChapterHeadingsFoundAdjustThe: 'No chapter headings found; adjust the rules',
    invalidBoundaryVolumeAndChapterHeadingRangesOverlap:
      'Volume and chapter heading ranges overlap',
    processingLimitEachBatchIsLimitedToChapters:
      'Each batch is limited to 500 chapters, including unclassified content',
    invalidStructureSingleDoesNotAcceptVolumeChapter: 'single does not accept volume/chapter rules',
    invalidStructureRegexRequiresAChapterRuleAnd:
      'regex requires a chapter rule and cannot also use heading levels',
    invalidStructureMarkdownRequiresAValidChapterLevel:
      'Markdown requires a valid chapter level and a shallower volume level',
    volumeNotFoundTheSpecifiedVolumeDoesNotExist: 'The specified volume does not exist',
    regexIndicesRequiredCaptureGroupPositionsAreUnsupportedSelect:
      'Capture-group positions are unsupported; select content using start/end markers',
    invalidSelectionRangeMarkersMustEachMatchExactly:
      'Range markers must each match exactly one nonempty passage',
    invalidSelectionBodyAndStartEndMarkersCannot: 'body and start/end markers cannot be combined',
    invalidSelectionThePatternRequiresANamedBody: 'The pattern requires a named body capture group',
    invalidSelectionBodyMustLieInsideTheActual: 'body must lie inside the actual match',
    invalidSelectionTheBodyRangeIsEmptyOr: 'The body range is empty or its boundaries are reversed',
    invalidStructureReplacementChaptersMustBeDistinct: 'Replacement chapters must be distinct',
    chapterNotFoundTheChapterToReplaceDoesNot: 'The chapter to replace does not exist',
    replacementScopeTheEmptyChapterToReplaceBelongs:
      'The empty chapter to replace belongs to another source',
    contentOverlapSourceContentIsAlreadyUsedBy:
      'Source content is already used by “{value1}”; specify replace_chapter_ids or reduce the scope',
    replacementScopeSingleFileSplittingCannotReplaceA:
      'Single-file splitting cannot replace a chapter containing existing library content',
    replacementScopeTheChapterToReplaceContainsAnother:
      'The chapter to replace contains another source',
    sourceChangedTheExtractionResourceChanged: 'The extraction resource changed',
    sourceChangedTheSourceSnapshotChangedExtractAnd:
      'The source snapshot changed; extract and preview again',
    nameInvalidTaskNamesMustBeNonempty: 'Task names must be nonempty',
    nameInvalidTaskNamesAreLimitedToDetail: 'Task names are limited to {value1} characters',
    nameLockedTheUserNamedThisTaskManually: 'The user named this task manually; do not rename it',
    taskUnnamedUseRenameImportTaskWithThe:
      'Use rename_import_task with the identified book information before generating an import plan',
    binaryContentTheContentContainsBinaryControlCharacters:
      'The content contains binary control characters',
    encodingRequiredCannotDecodeAsDetailCheckThe:
      'Cannot decode as {value1}; check the encoding or file integrity',
    encodingRequiredTextEncodingCannotBeDeterminedReliably:
      'Text encoding cannot be determined reliably; specify it or provide a readable file',
    markdownPositionCannotVerifyMarkdownSourcePositions: 'Cannot verify Markdown source positions',
    markdownPositionMarkdownBlocksDoNotCoverThe: 'Markdown blocks do not cover the full source',
    invalidContentRefSpecifyASavedBodyExtractionResource:
      'Specify a saved body extraction resource',
    unsupportedFormatTextSplittingSupportsOnlyTXTMarkdown:
      'Text splitting supports only TXT/Markdown extraction results',
    batchNotFoundTheTextStructurePlanDoesNot: 'The text structure plan does not exist',
    invalidPageInvalidTextStructurePagination: 'Invalid text structure pagination',
    batchNotFoundTheTextStructurePlanDoesNotVariant272:
      'The text structure plan does not exist or belongs to another task',
    todoNotFoundTheTodoDoesNotExistDetail: 'The todo does not exist: {value1}',
    invalidArgumentsTodoContentMustBeNonempty: 'Todo content must be nonempty',
    invalidArgumentsProvideIdOrIds: 'Provide id or ids',
    invalidArgumentsProvideIdOrItems: 'Provide id or items',
    toolNotAllowedTheToolWasNotExposedIn: 'The tool was not exposed in this import execution',
    argumentLimitReduceTheOperationScope: 'Reduce the operation scope',
    invalidArgumentsSourcesMustBeAnArray: 'sources must be an array',
    invalidArgumentsDetailMustBeText: '{value1} must be text',
    invalidPageOffsetMustBeANonnegativeInteger:
      'offset must be a nonnegative integer and limit must be 1–{value1}',
    taskNotFoundTheTaskDoesNotExist: 'The task does not exist',
    sourceScopeTheResourceDoesNotExist: 'The resource does not exist',
    unreadableResourceThisViewRequiresExtractedContent: 'This view requires extracted content',
    toolNotAllowedUnsupportedReadTool: 'Unsupported read tool',
    sourceNotFoundAtLeastOneContentsSourceIs: 'At least one contents source is required',
    sourceNotFoundContentsSourceDetailIsNotAn:
      'Contents source {value1} is not an available Web source in this task',
    snapshotMissingContentsSourceDetailHasNoSnapshot:
      'Contents source “{value1}” has no snapshot; run inspect_source first',
    sourceNotFoundContentsURLsMustBelongToThe: 'Contents URLs must belong to the same site',
    contentMismatchChapterExtractionRulesDifferProvideContent:
      'Chapter extraction rules differ; provide content_rules explicitly',
    pinnedLimitPinnedChapterDetailIsNotA:
      "Pinned chapter {value1} is not a selected chapter on this recipe's site",
    invalidLimitParsingLimitsMustBePositiveIntegers: 'Parsing limits must be positive integers',
    processingLimitParsingExceededTheTimeLimit: 'Parsing exceeded the time limit',
    invalidArchivePathTheArchivePathIsInvalidOr: 'The archive path is invalid or escapes its root',
    corruptArchiveTheLocalEntryDoesNotMatch: 'The local entry does not match the directory',
    corruptArchiveEntryNamesDoNotMatch: 'Entry names do not match',
    corruptArchiveTheZIPCentralDirectoryIsMissing: 'The ZIP central directory is missing',
    archiveLimitTooManyArchiveEntries: 'Too many archive entries',
    corruptArchiveInvalidSplitArchiveOrDirectoryRange: 'Invalid split archive or directory range',
    corruptArchiveTheDirectoryEntryIsCorrupt: 'The directory entry is corrupt',
    epubEncryptedEncryptedArchivesAreUnsupported: 'Encrypted archives are unsupported',
    unsupportedArchiveOnlyStoredAndDEFLATECompressionAre:
      'Only stored and DEFLATE compression are supported',
    archiveLimitDecompressedDataExceedsTheLimit: 'Decompressed data exceeds the limit',
    corruptArchiveInvalidDataRangeOrDuplicatePath: 'Invalid data range or duplicate path',
    corruptArchiveDirectoryLengthsDoNotMatch: 'Directory lengths do not match',
    archiveLimitTheInputFileExceedsTheLimit: 'The input file exceeds the limit',
    corruptArchiveZIPStructureOrFilenameEncodingIs: 'ZIP structure or filename encoding is corrupt',
    archiveLimitActualDecompressedDataExceedsTheLimit: 'Actual decompressed data exceeds the limit',
    corruptArchiveTheDecompressedLengthDiffersFromIts:
      'The decompressed length differs from its declaration',
    corruptArchiveCannotDecompressFileContent: 'Cannot decompress file content',
    corruptArchiveLengthOrCRCValidationFailed: 'Length or CRC validation failed',
    argumentUnknown: '{path} is not an allowed field',
    argumentMissing: '{path} is required',
    argumentMinItems: '{path} requires at least {count} items',
    argumentMaxItems: '{path} allows at most {count} items',
    argumentMinimum: '{path} must be at least {count}',
    argumentMaximum: '{path} must be at most {count}',
    argumentType: '{path} must have type {types}',
    argumentEnum: '{path} is not an allowed value',
    workerFailed: 'Parsing failed',
    storageQuota:
      'Local storage is full; the latest progress was not saved reliably. Free space and retry.',
    storageFailed: 'Local storage failed ({name}); the latest progress was not saved reliably.',
    htmlError: 'The service returned an HTML error page',
    sourceFailedNoBodyTextWasRetrieved: 'No body text was retrieved',
    sourceUnavailableNoNovelContentWasObtainedThis:
      'No novel content was obtained: this is a login, verification, or dynamic placeholder page. Add a file to this task',
    invalidExistingReferenceExistingParagraphReferencesAreMissingDuplicated:
      'Existing paragraph references are missing, duplicated, or do not match their source',
    chapterMatchRequiredTheURLForDetailMatchesSeveral:
      'The URL for “{value1}” matches several existing chapters',
    chapterMatchRequiredConfirmWhetherDetailIsNewOr:
      'Confirm whether “{value1}” is new or replaces a candidate chapter',
    chapterMatchRequiredTheSelectedExistingChapterNoLonger:
      'The selected existing chapter no longer exists',
    chapterSettingsConflictTheMergedScopeForDetailHas:
      'The merged scope for “{value1}” has different chapter settings; choose which source to keep',
    titleRequiredANewNovelRequiresATitle: 'A new novel requires a title',
    targetConfirmationRequiredTheTargetIdentityOrVersionIs:
      'The target identity or version is uncertain; explicitly select the update target',
    bookReadFailedCannotReadContentForDetailDetail: 'Cannot read content for “{value1}”: {value2}',
    sharedChapterIdSeveralLegacyNovelsShareAChapter:
      'Several legacy novels share a chapter ID; replacement is unsafe',
    partialRestructureTheRestructureScopeIncludesUnselectedOr:
      'The restructure scope includes unselected or unavailable chapters; select the full scope or adjust the matches',
    emptySelectionNoChaptersWithRetrievedBodyText:
      'No chapters with retrieved body text are selected',
    pendingQuestionCompleteTheRequiredChoicesFirst: 'Complete the required choices first',
    unsupportedGranularityNoChapterLinksWereDetectedOn:
      'No chapter links were detected on contents page {value1}; use catalog_selector to specify their scope',
    snapshotMissingMissingContentsSnapshotsDetailUseAdd:
      'Missing contents snapshots: {value1}. Use add_sources and inspect_source for these pages first',
    unsupportedGranularityDetailHasSeveralSourceURLsRecipes:
      '“{value1}” has several source URLs; recipes cannot combine chapters',
    unsupportedGranularityTheURLForDetailIsAbsent:
      'The URL for “{value1}” is absent from the replayed contents: {value2}',
    unsupportedGranularityDetailShareOneURLRecipesCannot:
      '{value1} share one URL; recipes cannot split chapters: {value2}',
    pinnedLimitThereAreDetailPinnedChaptersExceeding:
      'There are {value1} pinned chapters, exceeding 20% of matching chapters (maximum {value2}); use cleanup rules',
    snapshotMissingDetailHasNoPageSnapshotUse:
      '“{value1}” has no page snapshot; use extract_content or inspect_source first: {value2}',
    pinnedLimitReplayForDetailMatchesTheDraft:
      'Replay for “{value1}” matches the draft; pinned text is unnecessary',
    contentMismatchReplayDiffersFromTheDraftIn:
      'Replay differs from the draft in another {value1} chapters',
    noticeEncoding:
      'UTF-8 decoding failed; a unique readable Japanese encoding was used. Check the preview.',
    noticeGenericBody: 'A generic body scope was used; check for headers or supplementary text.',
    noticeExcludedSelector: 'User-selected exclusion: {selector}',
    noticeMetadata: 'Metadata',
    noticeExcludedNode: 'Excluded {node} navigation, scripts, or non-body resources',
    noticeBeforeBody: 'Before the selected body range',
    noticeAfterBody: 'After the selected body range',
    noticeHeadingWhitespace: 'Whitespace between headings',
    noticeVolumeHeading: 'Volume heading extracted into the structure',
    noticeChapterHeading: 'Chapter heading extracted into the title field',
    noticeEmptyChapter: 'Chapter body is empty',
    noticeUnassigned: 'Content before the heading is unassigned and unchecked by default',
    noticeDuplicateHeading: 'Duplicate chapter headings in one volume; check for contents matches',
    noticeShortChapter: 'Chapter body is short; check its boundaries',
    noticeLongChapter: 'Chapter body is unusually long; check for missed headings',
    noticeMarkdownMetadata: 'Markdown metadata definition',
    noticeRemoteResource: 'Remote resource was not fetched automatically: {url}',
    noticeMultiplePackages:
      'The EPUB contains several packages; check whether they belong to one work.',
    noticeMissingEpub: 'The EPUB is missing {count} reading resources.',
    defaultBody: 'Body',
    defaultVolume: 'Unassigned volume',
    defaultUnassigned: 'Unassigned content',
    defaultTask: 'New import task',
    defaultWebsiteTask: 'Import: {host}',
    recipeStale: 'The recipe is invalid and will not be saved in this import: {detail}',
    recipeExtraLines: 'Replay for “{title}” contains {count} extra lines: {sample}',
    recipeMissingLines: 'Replay for “{title}” is missing {count} lines: {sample}',
    recipeDifferentLine: 'Replay and draft for “{title}” differ at line {line}: {replay} ≠ {draft}',
    undoNotApplied: 'The plan was not applied; there is nothing to undo.',
    undoAlready: 'This import was already undone.',
    undoDeleted: 'The target novel was deleted.',
    undoChanged:
      'The novel has later translation, editing, sync, or import changes; the whole import cannot be undone.',
    cancelled: 'Canceled',
    parseCancelled: 'Parsing canceled',
    splitCancelled: 'Chapter splitting canceled',
    searchCancelled: 'Search canceled',
    previewCancelled: 'Preview canceled',
    operationCancelled: 'Operation canceled',
    matchAmbiguous:
      'Duplicate source text prevents an unambiguous match; specify existing references or confirm the replacement scope',
    matchLarge: 'The matching scope is too large; narrow it or confirm replacement',
    matchMany:
      'Many-to-many revisions require confirmation of the replacement scope and translation loss',
    metadataTitleConflict:
      'The metadata page title “{title}” differs from the selected novel; check the edition.',
    metadataAuthorConflict: 'The metadata page author “{author}” differs from the selected author.',
    metadataCandidateAuthor:
      'The candidate author differs from the novel author; a user decision is required.',
    matchTitle: 'Title match',
    matchAuthor: 'Author match',
    matchUrl: 'Source URL match',
    missingNotRead: '{title} (body unavailable)',
    missingNotSelected: '{title} (not selected)',
    sourceReadFailed: 'Reading failed',
    sourceNotRead:
      'Not read yet: content is saved after the assistant inspects or extracts this source.',
    defaultNextPage: 'Next page',
    bookSyncSessionBusyCheckingOrApplyingIsStill: 'Checking or applying is still running',
    bookSyncEntryMissingTheChapterIsNotIn: 'The chapter is not in this contents list',
    bookSyncEntryMissingASelectedChapterIsNot: 'A selected chapter is not in this contents list',
    bookSyncEntryUncheckedASelectedExistingChapterHas:
      'A selected existing chapter has no confirmed update',
    bookSyncCheckRequiredCheckTheContentsFirst: 'Check the contents first',
    bookSyncSelectionEmptySelectChapters: 'Select chapters',
    bookSyncUndoUnavailableThereIsNoApplicationTo:
      'There is no application to undo in this session',
    bookSyncBookChangedTheTargetChapterNoLonger: 'The target chapter no longer exists',
    bookSyncBookChangedTheChapterIDIsAlready: 'The chapter ID is already in use',
    bookSyncTargetVolumeMissingANewChapterRequiresA: 'A new chapter requires a destination volume',
    bookSyncTargetVolumeMissingTheSpecifiedVolumeNoLonger: 'The specified volume no longer exists',
    bookSyncBookChangedTheBookChangedReviewThe: 'The book changed; review the changes again',
    bookSyncBookChangedTheBookHasLaterChanges: 'The book has later changes and cannot be undone',
    bookSyncBookReadFailedTheBookDoesNotExist: 'The book does not exist',
    bookSyncCatalogFetchFailedTheSourceURLIsNot: 'The source URL is not a built-in site',
    bookSyncVerificationRequiredTheSourcePageRequiresLogin:
      'The source page requires login or verification',
    bookSyncCatalogUnrecognizedTheContentsCannotReproduceAt:
      'The contents cannot reproduce at least half the imported chapters',
    bookSyncCatalogEmptyNoChaptersWereDetectedIn: 'No chapters were detected in the contents',
    bookSyncCatalogFetchFailedTheContentsExceedsThePagination:
      'The contents exceeds the pagination limit; completeness cannot be confirmed',
    bookSyncContentEmptyTheSourceChapterBodyIs: 'The source chapter body is empty',
    bookSyncRawDiagnostic: '{detail}',
  },
};
