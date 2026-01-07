# Third-Party Libraries

This directory contains bundled third-party libraries to avoid installation issues on servers.

## pdf-lib/

Directory containing the bundled pdf-lib library for PDF manipulation operations.

### pdf-lib.min.js

Bundled version of pdf-lib library for PDF manipulation operations.

- **Source**: pdf-lib (https://github.com/Hopding/pdf-lib)
- **Version**: Latest stable (Updated)
- **Usage**: Used in PdfLib node for PDF operations like getting info and splitting PDFs
- **Import**: `const { PDFDocument } = require('../../lib/pdf-lib/pdf-lib.min.js');`

## Why Bundled?

The pdf-lib library can be difficult to install on some server environments due to native dependencies. By bundling it directly into the source code, we ensure:

1. No installation issues on servers
2. Consistent behavior across different environments
3. No dependency on npm registry availability
4. Faster deployment and setup

## Maintenance

When updating the bundled library:

1. Download the latest version from the official source
2. Replace the existing file in the `pdf-lib/` directory
3. Test thoroughly to ensure compatibility
4. Update this README if necessary

### Recent Updates

- **Latest Update**: Library has been updated to the latest stable version
- **Compatibility**: All existing functionality (get info, split PDF) remains compatible
- **Structure**: Library is now organized in a dedicated `pdf-lib/` subdirectory for better organization
