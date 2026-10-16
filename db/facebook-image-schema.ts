import {sql} from "drizzle-orm";
import {check,index,integer,sqliteTable,text,uniqueIndex} from "drizzle-orm/sqlite-core";
export const facebookImagePosts=sqliteTable("facebook_image_posts",{
  id:text("id").primaryKey().notNull(),title:text("title").notNull(),
  imageUrl:text("image_url").notNull().default(""),imageKey:text("image_key").notNull().default(""),caption:text("caption").notNull().default(""),
  scheduledAt:text("scheduled_at"),timeZone:text("time_zone").notNull().default("Europe/Bratislava"),status:text("status").notNull().default("draft"),version:integer("version").notNull().default(1),
  approvalStatus:text("approval_status").notNull().default("UNREVIEWED"),approvedAt:text("approved_at"),approvedBy:text("approved_by"),
  facebookPostId:text("facebook_post_id"),publishedAt:text("published_at"),notionPageId:text("notion_page_id"),syncHash:text("sync_hash"),
  createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),createdBy:text("created_by").notNull(),updatedBy:text("updated_by").notNull(),
},t=>[
  check("facebook_image_posts_status_check",sql`${t.status} IN ('draft','scheduled','published')`),
  check("facebook_image_posts_zone_check",sql`${t.timeZone}='Europe/Bratislava'`),check("facebook_image_posts_version_check",sql`${t.version}>=1`),
  check("facebook_image_posts_image_check",sql`(${t.imageUrl}='' AND ${t.imageKey}='') OR (${t.imageKey}<>'' AND ${t.imageUrl}='/media/' || ${t.imageKey})`),
  check("facebook_image_posts_schedule_check",sql`${t.status}<>'scheduled' OR (${t.scheduledAt} IS NOT NULL AND ${t.imageKey}<>'')`),
  index("facebook_image_posts_schedule_idx").on(t.status,t.scheduledAt,t.id),index("facebook_image_posts_updated_idx").on(t.updatedAt,t.id),
  uniqueIndex("facebook_image_posts_notion_idx").on(t.notionPageId).where(sql`${t.notionPageId} IS NOT NULL`),
]);

/** Optional V2 objects: migration 0130 is prepared until separately approved. */
export const facebookImagePublisherSettings=sqliteTable("facebook_image_publisher_settings",{
  id:integer("id").primaryKey().notNull(),
  enabled:integer("enabled").notNull().default(0),
  updatedAt:text("updated_at").notNull(),
  updatedBy:text("updated_by").notNull(),
},t=>[
  check("facebook_image_publisher_settings_singleton",sql`${t.id}=1`),
  check("facebook_image_publisher_settings_enabled",sql`${t.enabled} IN (0,1)`),
]);
export const facebookImagePublishAttempts=sqliteTable("facebook_image_publish_attempts",{
  postId:text("post_id").primaryKey().notNull().references(()=>facebookImagePosts.id,{onDelete:"restrict"}),
  snapshotVersion:integer("snapshot_version").notNull(),
  state:text("state").notNull().default("SENDING"),
  remoteId:text("remote_id"),
  startedAt:text("started_at").notNull(),
  completedAt:text("completed_at"),
  errorCode:text("error_code"),
},t=>[
  check("facebook_image_publish_attempts_snapshot_version",sql`${t.snapshotVersion}>=1`),
  check("facebook_image_publish_attempts_state",sql`${t.state} IN ('SENDING','PUBLISHED','UNCERTAIN')`),
  check("facebook_image_publish_attempts_remote_id",sql`(${t.state}='PUBLISHED' AND ${t.remoteId} IS NOT NULL AND ${t.completedAt} IS NOT NULL) OR (${t.state}<>'PUBLISHED' AND ${t.remoteId} IS NULL)`),
  index("facebook_image_publish_attempts_state_idx").on(t.state,t.startedAt),
]);
