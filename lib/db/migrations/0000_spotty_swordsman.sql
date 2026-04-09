CREATE TABLE "ai_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"provider_type" text NOT NULL,
	"api_key" text DEFAULT '' NOT NULL,
	"base_url" text,
	"model_name" text NOT NULL,
	"is_active" integer DEFAULT 0 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_enabled" integer DEFAULT 1 NOT NULL,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_name" text DEFAULT 'مساعد المتجر' NOT NULL,
	"personality" text,
	"greeting_message" text,
	"language" text DEFAULT 'auto' NOT NULL,
	"respond_to_orders" integer DEFAULT 1 NOT NULL,
	"reply_to_comments" integer DEFAULT 1 NOT NULL,
	"send_dm_on_comment" integer DEFAULT 1 NOT NULL,
	"active_provider_id" integer,
	"business_country" text,
	"business_city" text,
	"business_domain" text,
	"business_domain_custom" text,
	"target_audience" text,
	"business_hours_start" text DEFAULT '09:00',
	"business_hours_end" text DEFAULT '22:00',
	"timezone" text DEFAULT 'Africa/Algiers' NOT NULL,
	"outside_hours_message" text,
	"currency" text DEFAULT 'DZD' NOT NULL,
	"page_name" text,
	"page_description" text,
	"page_logo_url" text,
	"page_facebook_url" text,
	"strict_topic_mode" integer DEFAULT 0 NOT NULL,
	"off_topic_response" text,
	"blocked_keywords" text,
	"max_off_topic_messages" integer DEFAULT 3 NOT NULL,
	"handoff_keyword" text DEFAULT 'بشري',
	"handoff_message" text DEFAULT 'تم تحويلك إلى فريق الدعم البشري. سيتواصل معك أحد ممثلينا قريباً.',
	"current_plan" text DEFAULT 'free' NOT NULL,
	"lead_capture_enabled" integer DEFAULT 0 NOT NULL,
	"lead_capture_fields" text DEFAULT '["phone"]' NOT NULL,
	"lead_capture_message" text DEFAULT 'يسعدنا خدمتك! هل يمكنك مشاركتنا رقم هاتفك للتواصل؟',
	"use_quick_replies" integer DEFAULT 1 NOT NULL,
	"quick_reply_buttons" text,
	"working_hours_enabled" integer DEFAULT 1 NOT NULL,
	"abandoned_cart_enabled" integer DEFAULT 1 NOT NULL,
	"abandoned_cart_delay_hours" integer DEFAULT 1 NOT NULL,
	"abandoned_cart_message" text DEFAULT 'مرحباً! 👋 لاحظنا اهتمامك بـ {product_name}
هل تريد إتمام طلبك؟ نحن هنا لمساعدتك 😊',
	"bot_enabled" integer DEFAULT 1 NOT NULL,
	"bot_disabled_message" text DEFAULT 'عذراً، المساعد الذكي غير متاح حالياً. يرجى التواصل معنا لاحقاً.',
	"confidence_threshold" text DEFAULT '0.5' NOT NULL,
	"confidence_below_action" text DEFAULT 'none' NOT NULL,
	"safe_mode_enabled" integer DEFAULT 0 NOT NULL,
	"safe_mode_level" text DEFAULT 'standard' NOT NULL,
	"customer_memory_enabled" integer DEFAULT 0 NOT NULL,
	"sales_boost_enabled" integer DEFAULT 0 NOT NULL,
	"sales_boost_level" text DEFAULT 'medium' NOT NULL,
	"price_lock_enabled" integer DEFAULT 0 NOT NULL,
	"human_guarantee_enabled" integer DEFAULT 0 NOT NULL,
	"smart_escalation_enabled" integer DEFAULT 0 NOT NULL,
	"delivery_enabled" integer DEFAULT 0 NOT NULL,
	"appointments_enabled" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"original_price" real,
	"discount_price" real,
	"stock_quantity" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"images" text,
	"main_image_index" integer DEFAULT 0 NOT NULL,
	"category" text,
	"brand" text,
	"item_type" text,
	"price_tier" text,
	"external_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"fb_user_id" text NOT NULL,
	"fb_user_name" text,
	"fb_profile_url" text,
	"product_id" integer,
	"product_name" text,
	"unit_price" real,
	"quantity" integer DEFAULT 1 NOT NULL,
	"total_price" real,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"customer_name" text,
	"customer_phone" text,
	"customer_wilaya" text,
	"customer_address" text,
	"delivery_type" text,
	"delivery_price" real,
	"source" text DEFAULT 'messenger' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"fb_user_id" text NOT NULL,
	"fb_user_name" text,
	"fb_profile_url" text,
	"message" text NOT NULL,
	"sender" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"is_paused" integer DEFAULT 0 NOT NULL,
	"sentiment" text,
	"label" text,
	"confidence_score" double precision,
	"rescue_triggered" integer DEFAULT 0 NOT NULL,
	"safe_mode_blocked" integer DEFAULT 0 NOT NULL,
	"provider_name" text,
	"model_name" text,
	"source_type" text,
	"sales_trigger_type" text,
	"converted_to_order" integer DEFAULT 0 NOT NULL,
	"conversion_source" text,
	"conversion_value" double precision,
	"operator_note" text
);
--> statement-breakpoint
CREATE TABLE "comments_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" text,
	"comment_id" text,
	"fb_user_id" text NOT NULL,
	"fb_user_name" text,
	"fb_profile_url" text,
	"comment_text" text,
	"ai_reply" text,
	"dm_sent" integer DEFAULT 0 NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fb_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_access_token" text,
	"verify_token" text,
	"page_id" text,
	"app_secret" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"fb_user_id" text NOT NULL,
	"fb_user_name" text,
	"fb_profile_url" text,
	"service_name" text,
	"appointment_date" text,
	"time_slot" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"source" text DEFAULT 'messenger' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "available_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_of_week" integer NOT NULL,
	"time_slot" text NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"max_bookings" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"category" text,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"price_dzd" real DEFAULT 0 NOT NULL,
	"ai_conversations_limit" integer DEFAULT 100 NOT NULL,
	"products_limit" integer DEFAULT 10 NOT NULL,
	"providers_limit" integer DEFAULT 1 NOT NULL,
	"broadcast_limit" integer DEFAULT 0 NOT NULL,
	"appointments_enabled" integer DEFAULT 0 NOT NULL,
	"leads_enabled" integer DEFAULT 0 NOT NULL,
	"analytics_advanced" integer DEFAULT 0 NOT NULL,
	"multi_page" integer DEFAULT 0 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "subscription_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"month_year" text NOT NULL,
	"ai_conversations_used" integer DEFAULT 0 NOT NULL,
	"broadcast_sent" integer DEFAULT 0 NOT NULL,
	"messages_limit_warning_sent" integer DEFAULT 0 NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"message_text" text NOT NULL,
	"image_url" text,
	"target_filter" text DEFAULT 'all' NOT NULL,
	"target_label" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"scheduled_at" text,
	"sent_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"fb_user_id" text NOT NULL,
	"fb_user_name" text,
	"fb_profile_url" text,
	"phone" text,
	"email" text,
	"label" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"source" text DEFAULT 'messenger' NOT NULL,
	"last_interaction_at" text,
	"total_messages" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_fb_user_id_unique" UNIQUE("fb_user_id")
);
--> statement-breakpoint
CREATE TABLE "domain_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"template_name" text NOT NULL,
	"bot_name" text NOT NULL,
	"personality" text NOT NULL,
	"greeting_message" text NOT NULL,
	"sample_faqs" text DEFAULT '[]' NOT NULL,
	"sample_products" text DEFAULT '[]' NOT NULL,
	CONSTRAINT "domain_templates_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "order_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"fb_user_id" text NOT NULL,
	"product_name" text,
	"product_id" integer,
	"quantity" integer DEFAULT 1 NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"customer_wilaya" text,
	"customer_address" text,
	"delivery_type" text,
	"delivery_price" integer,
	"step" text DEFAULT 'collecting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_sessions_fb_user_id_unique" UNIQUE("fb_user_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"fb_user_id" text NOT NULL,
	"session_start" text NOT NULL,
	"session_end" text NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"ai_calls_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_usage_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"success" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_inquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"fb_user_id" text NOT NULL,
	"fb_user_name" text,
	"product_name" text NOT NULL,
	"product_id" integer,
	"inquired_at" text NOT NULL,
	"reminder_sent" integer DEFAULT 0 NOT NULL,
	"converted" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'offers' NOT NULL,
	"message_text" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"fb_user_id" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_product_context" (
	"fb_user_id" text PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pre_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"fb_user_id" text NOT NULL,
	"fb_user_name" text,
	"product_id" integer NOT NULL,
	"product_name" text,
	"customer_name" text,
	"phone" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pre_order_sessions" (
	"fb_user_id" text PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text,
	"step" text DEFAULT 'awaiting_name' NOT NULL,
	"customer_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"wilaya_id" integer NOT NULL,
	"wilaya_name" text NOT NULL,
	"home_price" integer DEFAULT 0 NOT NULL,
	"office_price" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "delivery_prices_wilaya_id_unique" UNIQUE("wilaya_id")
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_counters" (
	"fb_user_id" text PRIMARY KEY NOT NULL,
	"off_topic_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_messages" (
	"mid" text PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conversations_fb_user_id_timestamp_idx" ON "conversations" USING btree ("fb_user_id","timestamp");--> statement-breakpoint
CREATE INDEX "conversations_fb_user_id_sender_idx" ON "conversations" USING btree ("fb_user_id","sender");--> statement-breakpoint
CREATE INDEX "platform_events_fb_user_id_idx" ON "platform_events" USING btree ("fb_user_id");