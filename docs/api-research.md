# Claris FileMaker OData API Research

## Official Documentation

**Primary Source:** https://help.claris.com/en/odata-guide/content/index.html

### Overview
- OData is an industry-standard REST API for querying and updating FileMaker data
- Similar to ODBC/JDBC but for REST clients
- Returns JSON (primary) or Atom/XML format
- Conforms to OData 4.01 Protocol

### Authentication
- Authorization header required for ALL requests
- See: https://help.claris.com/en/odata-guide/content/creating-authenticated-connection.html

### HTTP Methods
| Method | Use Case |
|--------|----------|
| POST | Create tables, create field index, create records, run scripts |
| GET | Database structure, metadata, query options, request data |
| PATCH | Update records, update container fields, add fields to table |
| PUT | Create/update records, update containers, add fields |
| DELETE | Delete tables, fields, records |

### HTTP Headers
| Header | Values | Required |
|--------|--------|----------|
| Authorization | Basic/OAuth credentials | ✅ Always |
| Accept | application/json (default), application/atom+xml, text/html | |
| Content-Type | application/json (default), application/atom+xml, multipart/mixed | For POST/PATCH/PUT |
| OData-Version | 4.0 (FileMaker supports) | |
| OData-MaxVersion | 4.0 | |
| Prefer | odata.continue-on-error, odata.maxpagesize, return=representation | |

### FileMaker-Specific Headers
- `fmodata.basic-timestamp` - FileMaker timestamp format instead of Zulu time
- `fmodata.gmtoffset` - Timestamp difference from GMT
- `fmodata.entity-ids` - Include table and field IDs in response
- `fmodata.include-specialcolumns` - Include ROWID and ROWMODID

### URL Format
```
https://host/fmi/odata/version/database-name

- host: FileMaker Cloud or FileMaker Server hostname
- version: Always v4
- database-name: Name of hosted database

Example: /fmi/odata/v4/ContentMgmt
```

## Next Steps
1. Fetch supported features page
2. Fetch authentication details
3. Fetch write-odata-api-calls page for examples
4. Search GitHub for existing OData CLI implementations

## Resources Found
- Official Guide: https://help.claris.com/en/odata-guide/
- Write OData API calls: https://help.claris.com/en/odata-guide/content/write-odata-api-calls.html
- Supported features: https://help.claris.com/en/odata-guide/content/odata-supported-features.html
- Create record: https://help.claris.com/en/odata-guide/content/create-record.html
- Run scripts: https://help.claris.com/en/odata-guide/content/run-scripts.html
- DB Services blog: https://dbservices.com/blog/claris-filemaker-odata
- Beezwax examples: https://blog.beezwax.net/odata-for-filemaker-examples-tips-and-nuances/