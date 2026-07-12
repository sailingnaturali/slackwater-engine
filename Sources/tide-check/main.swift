import Foundation
import TideEngine

let checker = Checker()

print("tide-check — validating TideEngine against Neaps golden vectors\n")

checkAstronomy(checker)
checkNodeCorrections(checker)

checker.finish()
