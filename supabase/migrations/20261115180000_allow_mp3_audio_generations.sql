update storage.buckets
set allowed_mime_types = array['audio/mpeg', 'audio/wav']
where id = 'audio-generations';
