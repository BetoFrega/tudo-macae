# Localhost TLS fixture

This certificate and key are public test data for the loopback-only HTTPS provider.
They are valid from 2020 through 2100 and must never authenticate a production
service. The runner copies them into a temporary directory and trusts the certificate
only in its child processes; it removes those copies when the run ends.
