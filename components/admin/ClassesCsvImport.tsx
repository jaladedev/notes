"use client";

import { CsvBulkImport } from "@/components/admin/CsvBulkImport";
import { bulkCreateClasses } from "@/lib/actions/notes";

export function ClassesCsvImport() {
  return (
    <CsvBulkImport
      title="Classes"
      expectedColumns={["name", "educationlevel (primary/jss/sss, optional)", "levelnumber (optional)"]}
      sampleRow="JSS2A, jss, 2"
      mapRow={(r) => ({
        name: r.name ?? "",
        educationLevel: r.educationlevel || undefined,
        levelNumber: r.levelnumber || undefined,
      })}
      labelKey={(r) => r.name}
      onImport={bulkCreateClasses}
    />
  );
}
