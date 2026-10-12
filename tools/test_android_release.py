import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('stage_android',Path(__file__).with_name('stage-android-release.py'))
stage=importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)
CERT='a'*64

class ReleaseCertificateTests(unittest.TestCase):
    def test_old_and_new_signer_labels(self):
        for label in ('Signer #1', 'V2 Signer:', 'V3.0 Signer:', 'Signer (minSdkVersion=24, maxSdkVersion=32)'):
            with self.subTest(label=label):
                self.assertEqual(stage.release_certificate(f'{label} certificate SHA-256 digest: {CERT}\n',CERT),CERT)

    def test_repeated_same_certificate_across_schemes(self):
        self.assertEqual(stage.release_certificate(f'V2 Signer: certificate SHA-256 digest: {CERT.upper()}\nV3.0 Signer: certificate SHA-256 digest: {CERT}\n',CERT),CERT)

    def test_public_key_fingerprint_is_not_a_certificate(self):
        with self.assertRaises(ValueError):
            stage.release_certificate(f'Signer #1 public key SHA-256 digest: {CERT}\n',CERT)

    def test_wrong_or_extra_signer_is_rejected(self):
        for output in (f'Signer #1 certificate SHA-256 digest: {"b"*64}',f'Signer #1 certificate SHA-256 digest: {CERT}\nSigner #2 certificate SHA-256 digest: {"b"*64}'):
            with self.subTest(output=output),self.assertRaises(ValueError):
                stage.release_certificate(output,CERT)

    def test_invalid_expected_or_missing_digest_is_rejected(self):
        for output,expected in (('',CERT),('DOES NOT VERIFY',CERT),('', 'not-a-fingerprint')):
            with self.subTest(output=output),self.assertRaises(ValueError):
                stage.release_certificate(output,expected)

if __name__=='__main__':unittest.main()
