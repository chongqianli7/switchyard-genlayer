"""Deterministic transition checks with a stub SDK and model."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace

sdk = ModuleType("genlayer")
sdk.Address = str
sdk.u256 = int
sdk.TreeMap = dict
sdk.allow_storage = lambda value: value
sdk.gl = SimpleNamespace(
    Contract=object, UserError=ValueError,
    public=SimpleNamespace(write=lambda method: method, view=lambda method: method),
    message=SimpleNamespace(sender_address="operator"),
    nondet=SimpleNamespace(),
    eq_principle=SimpleNamespace(strict_eq=lambda run: run()),
)
spec = importlib.util.spec_from_file_location(
    "switchyard_contract", Path(__file__).resolve().parents[1] / "contracts/switchyard.py"
)
contract = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = contract
original_sdk = sys.modules.get("genlayer")
sys.modules["genlayer"] = sdk
try:
    spec.loader.exec_module(contract)
finally:
    if original_sdk is None:
        del sys.modules["genlayer"]
    else:
        sys.modules["genlayer"] = original_sdk


class Tests(unittest.TestCase):
    cases = json.dumps([["Everyone lost access", "INCIDENT"], ["Need an invoice copy", "SUPPORT"]])
    playbook = "Handle outages and ordinary invoice support."

    def setUp(self):
        self.desk = contract.Switchyard()
        self.desk.active, self.desk.trials, self.desk.tickets = {}, {}, {}
        self.user("operator")
        sdk.gl.eq_principle.strict_eq = lambda run: run()

    def user(self, address):
        sdk.gl.message.sender_address = address

    def submit_trial(self):
        self.desk.open_trial("builder", self.cases)
        trial_id = self.desk.count
        self.user("builder")
        self.desk.submit(trial_id, self.playbook)
        self.user("operator")
        return trial_id

    def test_missing_and_duplicate_cases(self):
        for cases in ["[]", '[["Everyone lost access","INCIDENT"],["Everyone lost access","SUPPORT"]]']:
            with self.assertRaises(ValueError):
                self.desk.open_trial("builder", cases)
        self.assertEqual(self.desk.count, 0)

    def test_consensus_mismatch_preserves_state(self):
        trial = self.submit_trial()
        def disagree(_):
            raise RuntimeError("Simulated model disagreement")
        sdk.gl.eq_principle.strict_eq = disagree
        with self.assertRaises(RuntimeError):
            self.desk.evaluate(trial)
        self.assertEqual(self.desk.get_trial(trial)["status"], "SUBMITTED")
        self.assertEqual(self.desk.active_revision("operator"), 0)

    def test_invalid_model_response_goes_to_review(self):
        sdk.gl.nondet.exec_prompt = lambda _: "UNKNOWN"
        self.assertEqual(contract.classify(self.playbook, "An ordinary support ticket"), "REVIEW")

    def test_older_trial_and_repeat_submission_fail(self):
        first = self.submit_trial()
        second = self.submit_trial()
        self.user("builder")
        with self.assertRaises(ValueError):
            self.desk.submit(first, self.playbook)
        self.user("operator")
        results = iter(["INCIDENT", "SUPPORT"])
        sdk.gl.nondet.exec_prompt = lambda _: next(results)
        self.desk.evaluate(first)
        with self.assertRaises(ValueError):
            self.desk.evaluate(first)
        with self.assertRaises(ValueError):
            self.desk.evaluate(second)
        self.assertEqual(self.desk.active_revision("operator"), first)


if __name__ == "__main__":
    unittest.main()
