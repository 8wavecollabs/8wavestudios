// Online mode: paste your Supabase project's URL and anon (public) key here.
// Find them in Supabase → Project Settings → API. The anon key is meant to be public;
// the database rules in supabase/schema.sql are what keep your data safe.
// Leave both empty to run fully offline (data stays in this browser).
window.APP_CONFIG = {
  supabaseUrl: 'https://mchpykpjjingtbmwqxjl.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHB5a3BqamluZ3RibXdxeGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTg1MDksImV4cCI6MjEwODUzNDUwOX0.EYeZ7qWVlnGqPLyWtuQibPmwkqdSpV8h7ZaXtRaGqRA',
  previewSeconds: 75,   // length of the streaming preview uploaded for each beat
  previewKbps: 96,      // preview quality; 75s @ 96kbps ≈ 0.9 MB per beat
};
