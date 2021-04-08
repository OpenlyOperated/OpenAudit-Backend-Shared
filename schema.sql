SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;

SET search_path = public, pg_catalog;

SET default_with_oids = false;

/*****************************************************/
/*********************** USERS ***********************/
/*****************************************************/

CREATE TABLE users (
    id text NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    email_encrypted text NOT NULL,
    password text NOT NULL,
    email_confirmed boolean DEFAULT false NOT NULL,
    email_confirm_code text NOT NULL,
    change_email text,
    password_reset_code text,
    create_date timestamp with time zone DEFAULT now() NOT NULL,
    delete_date timestamp with time zone,
    delete_reason text,
    banned boolean DEFAULT false NOT NULL,
    do_not_email boolean DEFAULT false NOT NULL,
    do_not_email_code text DEFAULT upper(substring(md5(random()::text) from 0 for 20)) NOT NULL,
    newsletter_subscribed boolean NOT NULL DEFAULT true,
    newsletter_unsubscribe_code text NOT NULL DEFAULT upper("substring"(md5(random()::text), 0, 20)),
    real_name text,
    linkedin text,
    github text,
    qualifications text
);

ALTER TABLE ONLY users
    ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE ONLY users
    ADD CONSTRAINT users_id_key UNIQUE (id);

CREATE UNIQUE INDEX users_lowercase_username ON users((lower(username)) text_ops);


CREATE TABLE docs (
    id text PRIMARY KEY,
    content text,
    owner text NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    visibility text NOT NULL DEFAULT 'private',
    allow_audit boolean NOT NULL DEFAULT false,
    featured boolean NOT NULL DEFAULT false,
    create_date timestamp without time zone NOT NULL DEFAULT now(),
    modify_date timestamp without time zone NOT NULL DEFAULT now(),
    title text,
    alias text
);

CREATE INDEX docs_owner_index ON docs(owner text_ops);
CREATE UNIQUE INDEX docs_lowercase_username ON docs((lower(alias)) text_ops);


CREATE TABLE audits (
    id text PRIMARY KEY,
    data text NOT NULL DEFAULT '{}'::text,
    auditor text REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    doc text REFERENCES docs(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX audits_user_index ON audits(auditor text_ops);
CREATE INDEX audits_doc_index ON audits(doc text_ops);
CREATE UNIQUE INDEX audits_auditor_doc_index ON audits(auditor text_ops,doc text_ops);

/*****************************************************/
/******************* ADMIN USERS *******************/
/*****************************************************/

CREATE TABLE admin_users (
    email text NOT NULL,
    password text NOT NULL,
    email_confirmed boolean DEFAULT false NOT NULL,
    email_confirm_code text NOT NULL,
    password_reset_code text
);

ALTER TABLE ONLY admin_users
    ADD CONSTRAINT admin_users_email_pkey PRIMARY KEY (email);

/*****************************************************/
/********************* CAMPAIGNS *********************/
/*****************************************************/

CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  name text NOT NULL,
  from_address text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  plaintext text NOT NULL,
  create_date timestamp without time zone NOT NULL DEFAULT now(),
  last_sent_date timestamp without time zone
);

/*****************************************************/
/****************** CAMPAIGN EMAILS ******************/
/*****************************************************/

CREATE TABLE campaign_emails (
  id SERIAL PRIMARY KEY,
  campaign_id integer NOT NULL REFERENCES campaigns(id),
  email_encrypted text NOT NULL,
  unsubscribe_code text NOT NULL,
  sent boolean NOT NULL DEFAULT false,
  failed boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX campaign_id_email_unique ON campaign_emails(campaign_id int4_ops,email_encrypted text_ops);

/*****************************************************/
/************************ ROLES **********************/
/*****************************************************/

CREATE USER main WITH ENCRYPTED PASSWORD '{{ main_password }}';
GRANT SELECT, INSERT, UPDATE ON users TO main;
GRANT SELECT, INSERT, UPDATE, DELETE ON docs TO main;
GRANT SELECT, INSERT, UPDATE, DELETE ON audits TO main;

CREATE USER debug WITH ENCRYPTED PASSWORD '{{ debug_password }}';
