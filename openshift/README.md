# Deploy Meta-Chapter-Manager to OpenShift
# 
# Prerequisites:
#   oc login https://api.your-cluster.example.com --token=<token>
#   oc project <your-namespace>
#
# 1. Edit secret.yaml and set JWT_SECRET (and git credentials if needed)
#
# 2. Apply all manifests:
#      oc apply -f openshift/
#
# 3. Watch rollout:
#      oc rollout status deployment/meta-chapter-manager
#
# 4. Get the public URL:
#      oc get route meta-chapter-manager
#
# Update to a new image:
#      oc rollout restart deployment/meta-chapter-manager
#
# View logs:
#      oc logs -f deployment/meta-chapter-manager
