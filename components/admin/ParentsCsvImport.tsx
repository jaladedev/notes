"use client";

import { CsvBulkImport } from "@/components/admin/CsvBulkImport";
import { bulkCreateParents } from "@/lib/actions/accountAdmin";

export function ParentsCsvImport() {
  return (
    <CsvBulkImport
      title="Parents"
      expectedColumns={["fullname", "email", "children (optional: student emails separated by ;)"]}
      sampleRow="Mrs Obi, obi@example.com, ada@example.com; tunde@example.com"
      mapRow={(r) => ({ fullName: r.fullname ?? "", email: r.email ?? "", children: r.children || undefined })}
      labelKey={(r) => r.email}
      onImport={bulkCreateParents}
    />
  );
}
