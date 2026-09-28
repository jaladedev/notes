"use client";

import { CsvBulkImport } from "@/components/admin/CsvBulkImport";
import { bulkCreateStudents } from "@/lib/actions/accountAdmin";

export function StudentsCsvImport() {
  return (
    <CsvBulkImport
      title="Students"
      expectedColumns={["fullname", "email", "classname (optional)"]}
      sampleRow="Ada Obi, ada@example.com, JSS2A"
      mapRow={(r) => ({ fullName: r.fullname ?? "", email: r.email ?? "", className: r.classname || undefined })}
      labelKey={(r) => r.email}
      onImport={bulkCreateStudents}
    />
  );
}
