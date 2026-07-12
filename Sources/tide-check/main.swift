import Foundation
import TideEngine

let checker = Checker()

print("tide-check — validating TideEngine against Neaps golden vectors\n")

checkAstronomy(checker)

checker.finish()
