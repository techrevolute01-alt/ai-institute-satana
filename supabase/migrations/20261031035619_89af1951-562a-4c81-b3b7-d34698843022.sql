-- course-videos: admins upload and manage, learners with course access can read
CREATE POLICY "cv_admin_insert" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'course-videos'
  AND private.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "cv_admin_update" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'course-videos'
  AND private.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'course-videos'
  AND private.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "cv_admin_delete" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'course-videos'
  AND private.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "cv_course_access_read" ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'course-videos'
  AND (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_course_access(auth.uid(), (string_to_array(name, '/'))[2]::uuid)
  )
);

-- profile-images: each user manages only their own folder
CREATE POLICY "pi_owner_all" ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'profile-images'
  AND (string_to_array(name, '/'))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'profile-images'
  AND (string_to_array(name, '/'))[1] = auth.uid()::text
);