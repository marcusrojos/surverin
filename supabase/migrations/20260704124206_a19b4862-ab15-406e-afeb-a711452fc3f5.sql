-- Prioritize username over email when resolving a login identifier
CREATE OR REPLACE FUNCTION public.resolve_identifier_to_email(identifier text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT email FROM profiles WHERE username = identifier LIMIT 1),
    (SELECT email FROM profiles WHERE email = identifier LIMIT 1),
    (SELECT email FROM profiles WHERE LOWER(full_name) = LOWER(identifier) LIMIT 1),
    (SELECT p2.email FROM pharmacies ph JOIN profiles p2 ON p2.user_id = ph.user_id WHERE ph.client_code = identifier LIMIT 1)
  )
$function$;