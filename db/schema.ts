import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_users_email').on(table.email)],
);

export const subscriptions = sqliteTable('subscriptions', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  plan: text('plan').notNull().default('trial'),
  status: text('status').notNull().default('trialing'),
  trialEndsAt: integer('trial_ends_at').notNull(),
  providerCustomerId: text('provider_customer_id'),
  providerSubscriptionId: text('provider_subscription_id'),
  updatedAt: integer('updated_at').notNull(),
});

export const reviews = sqliteTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    title: text('title'),
    purpose: text('purpose').notNull(),
    inclusion: text('inclusion').notNull(),
    exclusion: text('exclusion').notNull(),
    population: text('population'),
    intervention: text('intervention'),
    comparison: text('comparison'),
    outcomes: text('outcomes'),
    fullTextUseTiabCriteria: integer('full_text_use_tiab_criteria'),
    fullTextInclusion: text('full_text_inclusion'),
    fullTextExclusion: text('full_text_exclusion'),
    fullTextCriteriaUpdatedAt: integer('full_text_criteria_updated_at'),
    stage: text('stage').notNull().default('protocol'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_reviews_owner_updated').on(table.ownerId, table.updatedAt),
  ],
);

export const uploads = sqliteTable(
  'uploads',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    fileName: text('file_name').notNull(),
    sourceDatabase: text('source_database').notNull().default('Unknown'),
    r2Key: text('r2_key').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    recordCount: integer('record_count').notNull().default(0),
    status: text('status').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_uploads_review').on(table.reviewId, table.createdAt)],
);

export const references = sqliteTable(
  'references',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id),
    uploadId: text('upload_id')
      .notNull()
      .references(() => uploads.id),
    title: text('title'),
    abstract: text('abstract'),
    authors: text('authors'),
    year: text('year'),
    journal: text('journal'),
    doi: text('doi'),
    pmid: text('pmid'),
    fullTextLookupStatus: text('full_text_lookup_status'),
    fullTextLookupAt: integer('full_text_lookup_at'),
    rawSource: text('raw_source').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_references_review').on(table.reviewId),
    index('idx_references_review_doi').on(table.reviewId, table.doi),
    index('idx_references_review_pmid').on(table.reviewId, table.pmid),
  ],
);

export const duplicatePairs = sqliteTable(
  'duplicate_pairs',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id),
    leftReferenceId: text('left_reference_id')
      .notNull()
      .references(() => references.id),
    rightReferenceId: text('right_reference_id')
      .notNull()
      .references(() => references.id),
    matchType: text('match_type').notNull(),
    confidence: integer('confidence').notNull(),
    status: text('status').notNull().default('suggested'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_duplicate_pairs_review').on(table.reviewId, table.status),
  ],
);

export const screeningDecisions = sqliteTable(
  'screening_decisions',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id),
    referenceId: text('reference_id')
      .notNull()
      .references(() => references.id),
    decision: text('decision').notNull(),
    notes: text('notes'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_screening_decisions_review_reference').on(
      table.reviewId,
      table.referenceId,
    ),
    index('idx_screening_decisions_review_decision').on(
      table.reviewId,
      table.decision,
    ),
  ],
);

export const screeningAssessments = sqliteTable(
  'screening_assessments',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id),
    referenceId: text('reference_id')
      .notNull()
      .references(() => references.id),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    status: text('status').notNull(),
    decision: text('decision'),
    score: integer('score'),
    confidence: integer('confidence'),
    matchedCriteria: text('matched_criteria'),
    reason: text('reason'),
    missingInformation: text('missing_information'),
    rawResponse: text('raw_response'),
    errorCode: text('error_code'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_screening_assessments_unique').on(
      table.reviewId,
      table.referenceId,
      table.provider,
      table.promptVersion,
    ),
    index('idx_screening_assessments_review_reference').on(
      table.reviewId,
      table.referenceId,
    ),
  ],
);

export const screeningJobs = sqliteTable(
  'screening_jobs',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('running'),
    requestedCount: integer('requested_count').notNull(),
    processedCount: integer('processed_count').notNull().default(0),
    successfulCount: integer('successful_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    currentReferenceId: text('current_reference_id').references(
      () => references.id,
    ),
    costConfirmed: integer('cost_confirmed').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_screening_jobs_review_updated').on(
      table.reviewId,
      table.updatedAt,
    ),
    index('idx_screening_jobs_owner_status').on(table.ownerId, table.status),
  ],
);

export const fullTextFiles = sqliteTable(
  'full_text_files',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id),
    referenceId: text('reference_id')
      .notNull()
      .references(() => references.id),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    fileName: text('file_name').notNull(),
    r2Key: text('r2_key').notNull(),
    aiR2Key: text('ai_r2_key'),
    aiSize: integer('ai_size'),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    status: text('status').notNull().default('uploaded'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_full_text_files_review_reference').on(
      table.reviewId,
      table.referenceId,
    ),
    index('idx_full_text_files_review').on(table.reviewId, table.createdAt),
  ],
);

export const fullTextAssessments = sqliteTable(
  'full_text_assessments',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id),
    referenceId: text('reference_id')
      .notNull()
      .references(() => references.id),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    status: text('status').notNull(),
    decision: text('decision'),
    score: integer('score'),
    confidence: integer('confidence'),
    matchedCriteria: text('matched_criteria'),
    reason: text('reason'),
    missingInformation: text('missing_information'),
    rawResponse: text('raw_response'),
    errorCode: text('error_code'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_full_text_assessments_unique').on(
      table.reviewId,
      table.referenceId,
      table.provider,
      table.promptVersion,
    ),
    index('idx_full_text_assessments_review_reference').on(
      table.reviewId,
      table.referenceId,
    ),
  ],
);

export const fullTextDecisions = sqliteTable(
  'full_text_decisions',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id),
    referenceId: text('reference_id')
      .notNull()
      .references(() => references.id),
    decision: text('decision').notNull(),
    notes: text('notes'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_full_text_decisions_review_reference').on(
      table.reviewId,
      table.referenceId,
    ),
    index('idx_full_text_decisions_review_decision').on(
      table.reviewId,
      table.decision,
    ),
  ],
);
